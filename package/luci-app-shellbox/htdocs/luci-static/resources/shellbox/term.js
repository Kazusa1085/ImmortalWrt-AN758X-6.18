'use strict';
// shellbox/term.js —— ttyd 的 WebSocket 协议 + xterm.js 会话封装
//
// 协议（ttyd 1.7.x；从它自带的前端 bundle 读出来，并在真机上用 ws 客户端验证过）：
//
//   连接 : new WebSocket(url, ['tty'])          ← 必须带 tty 子协议
//   握手 : open 后发【二进制】帧，内容是**裸 JSON**({AuthToken, columns, rows})。
//          注意裸：初始化之前整帧都被当 JSON 解析，加任何首字节（包括 '0'）
//          都会让 ttyd 判非法并立刻关闭连接（真机现象：101 之后马上 Closed）。
//
//   上行（客户端 → ttyd），二进制帧首字节：
//      '0' + data     键盘 / 粘贴输入
//      '1' + JSON     resize {columns, rows}
//      '2'            流控 ACK（终端已消化积压，可以继续发）
//      '3'            流控 PAUSE（终端处理不过来，先别发）
//
//   下行（ttyd → 客户端），同样是二进制帧首字节：
//      '0' + data     终端输出
//      '1' + title    标题
//      '2' + JSON     client options（ttyd 的 -t key=value 就靠这条下发）
//
// 这个文件刻意分两层：Protocol 是纯函数（Node 里可直接单测，不需要浏览器），
// Terminal 只负责把 WebSocket / xterm / 流控接起来。

/* ------------------------------------------------------------------ 协议 -- */

var CLIENT = { DATA: 0x30, RESIZE: 0x31, ACK: 0x32, PAUSE: 0x33 };  /* '0' '1' '2' '3' */
var SERVER = { OUTPUT: 0x30, TITLE: 0x31, OPTIONS: 0x32 };          /* '0' '1' '2' */

var encoder = new TextEncoder();
var decoder = new TextDecoder();

function prefixed(prefix, bytes) {
	var out = new Uint8Array(bytes.length + 1);

	out[0] = prefix;
	out.set(bytes, 1);
	return out;
}

var Protocol = {
	CLIENT: CLIENT,
	SERVER: SERVER,

	/* 握手帧：ttyd 要的是**二进制帧**，但内容就是裸 JSON，
	 * 前面**不能**加 '0'（那个前缀是「已初始化之后的输入数据」用的）。
	 * ttyd 在 initialized 之前把整帧当 JSON 解析，多一个字节就直接判非法并关闭连接
	 * —— 真机上表现为握手 101 之后立刻 Closed。 */
	init: function(authToken, columns, rows) {
		return encoder.encode(JSON.stringify({ AuthToken: authToken || '', columns: columns, rows: rows }));
	},

	/* 输入：'0' + UTF-8 数据 */
	input: function(data) {
		var bytes = (typeof data == 'string') ? encoder.encode(data) : data;

		return prefixed(CLIENT.DATA, bytes);
	},

	/* 窗口尺寸：'1' + JSON */
	resize: function(columns, rows) {
		return prefixed(CLIENT.RESIZE,
			encoder.encode(JSON.stringify({ columns: columns, rows: rows })));
	},

	ack: function() {
		return Uint8Array.of(CLIENT.ACK);
	},

	pause: function() {
		return Uint8Array.of(CLIENT.PAUSE);
	},

	/* 下行帧解码：{ cmd, raw, data }
	 *   cmd  : 'output' | 'title' | 'options' | 'unknown'
	 *   raw  : 去掉首字节后的视图（output 直接喂 xterm，零拷贝）
	 *   data : title 是字符串，options 是对象，output 是 null */
	decode: function(buffer) {
		var view = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer);

		if (view.length < 1)
			return { cmd: 'unknown', raw: view, data: null };

		var raw = view.subarray(1);

		switch (view[0]) {
		case SERVER.OUTPUT:
			return { cmd: 'output', raw: raw, data: null };
		case SERVER.TITLE:
			return { cmd: 'title', raw: raw, data: decoder.decode(raw) };
		case SERVER.OPTIONS:
			try {
				return { cmd: 'options', raw: raw, data: JSON.parse(decoder.decode(raw)) };
			}
			catch (e) {
				return { cmd: 'options', raw: raw, data: {} };
			}
		default:
			return { cmd: 'unknown', raw: raw, data: null };
		}
	}
};

/* ---------------------------------------------------------------- 会话 -- */

/* 流控参数：和 ttyd 自带前端一个套路 ——
 * 攒够 BATCH 字节才开始计入 pending；pending 超过 MAX 就 PAUSE，降到 RESUME 就 ACK。 */
var BATCH = 128 * 1024;
var MAX_PENDING = 8;
var RESUME_PENDING = 4;

var Terminal = L.Class.extend({
	__name__: 'Shellbox.Terminal',

	/**
	 * @param container  终端挂载点（xterm 会接管它）
	 * @param opts.Terminal / opts.FitAddon  vendored 的构造器（见 shellbox/vendor.js）
	 * @param opts.url     ws url，例如 ws://192.168.128.1:7682/ws
	 * @param opts.token   ttyd -c 的 AuthToken（没配就留空）
	 * @param opts.onTitle / opts.onState / opts.onOptions  回调
	 */
	__init__: function(container, opts) {
		this.opts = opts || {};
		this.url = this.opts.url;
		this.token = this.opts.token || '';
		this.state = 'connecting';
		this.written = 0;
		this.pending = 0;
		this.disposed = false;
		this.autoReconnect = true;
		this.reconnectDelay = 2000;
		this.reconnectTimer = null;
		this.readyScan = '';
		this.readyNotified = false;

		this.term = new this.opts.Terminal({
			cursorBlink: true,
			scrollback: this.opts.scrollback || 5000,
			fontSize: this.opts.fontSize || 14,
			fontFamily: this.opts.fontFamily ||
				'ui-monospace, "JetBrains Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace',
			allowProposedApi: true,
			theme: this.opts.theme || {
				background: '#1b1b1b',
				foreground: '#e8e8e8',
				cursor: '#e8e8e8',
				selectionBackground: '#3a4a5a'
			}
		});

		if (this.opts.FitAddon) {
			this.fit = new this.opts.FitAddon();
			this.term.loadAddon(this.fit);
		}

		this.term.open(container);
		this.term.onData(L.bind(this.handleInput, this));
		this.term.onResize(L.bind(this.handleResize, this));

		/* 目录联动用：/etc/profile.d/shellbox.sh 在 cd 后发 OSC 1337 cwd=<path> */
		if (this.term.parser && this.term.parser.registerOscHandler)
			this.oscHandler = this.term.parser.registerOscHandler(1337, L.bind(this.handleOsc, this));

		this.onWindowResize = L.bind(this.fitToContainer, this);
		window.addEventListener('resize', this.onWindowResize);

		this.connect();
	},

	/* ------------------------------------------------------------ 连接 -- */

	connect: function() {
		var self = this;

		if (this.disposed)
			return;

		this.readyScan = '';
		this.readyNotified = false;
		this.setState('connecting');
		this.fitToContainer();

		this.socket = new WebSocket(this.url, [ 'tty' ]);
		this.socket.binaryType = 'arraybuffer';

		this.socket.addEventListener('open', function() {
			self.reconnectDelay = 2000;
			self.setState('open');
			self.send(Protocol.init(self.token, self.term.cols, self.term.rows));
			self.term.focus();
		});

		this.socket.addEventListener('message', L.bind(this.handleFrame, this));

		this.socket.addEventListener('close', function() {
			self.socket = null;
			self.setState('closed');

			if (!self.disposed && self.autoReconnect) {
				if (self.reconnectTimer)
					clearTimeout(self.reconnectTimer);

				self.reconnectTimer = setTimeout(function() {
					self.reconnectTimer = null;
					self.connect();
				}, self.reconnectDelay);

				self.reconnectDelay = Math.min(self.reconnectDelay * 2, 30000);
			}
		});

		this.socket.addEventListener('error', function() {
			/* close 随后必到，统一在那里处理 */
		});
	},

	/* ------------------------------------------------------------ 收发 -- */

	send: function(frame) {
		var socket = this.socket;

		if (frame && socket && socket.readyState == WebSocket.OPEN)
			socket.send(frame);
	},

	handleInput: function(data) {
		this.send(Protocol.input(data));
	},

	handleResize: function(size) {
		this.send(Protocol.resize(size.cols, size.rows));
	},

	handleFrame: function(ev) {
		var frame = Protocol.decode(ev.data);

		switch (frame.cmd) {
		case 'output':
			this.write(frame.raw);
			this.scanReady(frame.raw);
			break;
		case 'title':
			if (this.opts.onTitle)
				this.opts.onTitle(frame.data);
			break;
		case 'options':
			if (this.opts.onOptions)
				this.opts.onOptions(frame.data);
			break;
		}
	},

	/* OSC 1337;cwd=<path> —— iTerm2 约定，我们的 profile 钩子用它汇报终端目录 */
	/* Fallback for xterm versions that do not expose parser.registerOscHandler:
	 * the profile emits an OSC 1337;shellbox-ready marker; scan raw output too. */
	scanReady: function(chunk) {
		if (this.readyNotified)
			return;

		this.readyScan += decoder.decode(chunk, { stream: true });

		if (this.readyScan.indexOf('shellbox-ready') >= 0) {
			this.readyNotified = true;

			if (this.opts.onReady)
				this.opts.onReady();
		}
		else if (this.readyScan.length > 8192) {
			this.readyScan = this.readyScan.slice(-4096);
		}
	},

	handleOsc: function(data) {
		var text = String(data || '');

		if (text == 'shellbox-ready') {
			this.readyNotified = true;

			if (this.opts.onReady)
				this.opts.onReady();

			return true;
		}

		var m = /^cwd=(.*)$/.exec(text);

		if (!m)
			return false;

		if (this.opts.onCwd)
			this.opts.onCwd(m[1]);

		return true;
	},

	/* 直接把 Uint8Array 喂给 xterm（它内部按 UTF-8 解码），比先转字符串再转回去快 */
	write: function(chunk) {
		var self = this;

		this.written += chunk.length;

		if (this.written < BATCH) {
			this.term.write(chunk);
			return;
		}

		this.term.write(chunk, function() {
			self.pending = Math.max(self.pending - 1, 0);

			if (self.pending < RESUME_PENDING)
				self.send(Protocol.ack());
		});

		this.pending++;
		this.written = 0;

		if (this.pending > MAX_PENDING)
			this.send(Protocol.pause());
	},

	/* ------------------------------------------------------------ 其他 -- */

	setState: function(state) {
		this.state = state;

		if (this.opts.onState)
			this.opts.onState(state);
	},

	fitToContainer: function() {
		if (this.fit) {
			try {
				this.fit.fit();
			}
			catch (e) {
				/* 容器不可见（切到别的 tab）时 fit() 会抛，忽略即可 */
			}
		}
	},

	focus: function() {
		if (this.term)
			this.term.focus();
	},

	reconnect: function() {
		this.autoReconnect = true;
		this.reconnectDelay = 2000;

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		this.disconnect();

		if (this.term)
			this.term.reset();

		this.written = 0;
		this.pending = 0;
		this.connect();
	},

	disconnect: function() {
		var socket = this.socket;

		this.socket = null;

		if (socket) {
			try { socket.close(); } catch (e) { /* ignore */ }
		}
	},

	dispose: function() {
		this.disposed = true;
		this.autoReconnect = false;

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		this.disconnect();
		window.removeEventListener('resize', this.onWindowResize);

		if (this.oscHandler) {
			try { this.oscHandler.dispose(); } catch (e) { /* ignore */ }
			this.oscHandler = null;
		}

		if (this.term) {
			try { this.term.dispose(); } catch (e) { /* ignore */ }
			this.term = null;
		}
	}
});

/* 导出（LuCI 模块约定：工厂必须返回 L.Class，loader 会 new 一个单例）：
 * 视图拿到的是实例，用 new term.Terminal(node, opts) 建会话，用 term.Protocol 做纯函数级测试。 */
return L.Class.extend({
	__name__: 'ShellboxTerm',

	CLIENT: CLIENT,
	SERVER: SERVER,
	Protocol: Protocol,
	Terminal: Terminal
});
