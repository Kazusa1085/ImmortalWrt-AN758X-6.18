'use strict';

'require view';
'require dom';
'require fs';
'require uci';
'require ui';
'require shellbox/vendor as vendor';
'require shellbox/term as termlib';
'require shellbox/files as fileslib';

var SPLIT_KEY = 'shellbox.split';

function shellQuote(path) {
	return "'" + String(path).replace(/'/g, "'\\''") + "'";
}

function wsUrl(port, ssl) {
	var scheme = (ssl == '1' || location.protocol == 'https:') ? 'wss://' : 'ws://';

	return scheme + location.hostname + ':' + port + '/ws';
}

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load: function() {
		return uci.load('shellbox');
	},

	render: function() {
		var self = this;

		this.term = null;
		this.files = null;

		var port = uci.get('shellbox', 'main', 'port') || '7682';
		var ssl = uci.get('shellbox', 'main', 'ssl') || '0';
		var linkCwd = uci.get('shellbox', 'main', 'link_cwd') || '0';
		var perPage = parseInt(uci.get('shellbox', 'main', 'per_page'), 10) || 50;

		this.linkCwd = (linkCwd == '1');
		this.shellReady = false;

		this.stateDot = E('span', { 'class': 'shellbox-dot shellbox-dot-connecting' });
		this.stateText = E('span', {}, [ _('连接中…') ]);
		this.titleText = E('span', { 'class': 'cbi-value-description' }, [ '' ]);

		var btnReconnect = E('button', { 'class': 'btn cbi-button' }, [ _('重连') ]);
		var btnClear = E('button', { 'class': 'btn cbi-button' }, [ _('清屏') ]);


		this.files = new fileslib.Panel({
			path: '/tmp/upload',
			perPage: perPage,
			onPathChange: function(path) { self.handlePanelPath(path); }
		});

		this.termNode = E('div', { 'class': 'shellbox-term' });
		this.filesNode = E('div', { 'class': 'shellbox-files-wrap' });
		this.splitter = E('div', { 'class': 'shellbox-splitter' });

		this.termPane = E('div', { 'class': 'shellbox-pane shellbox-pane-term' }, [ this.termNode ]);
		this.filesPane = E('div', { 'class': 'shellbox-pane shellbox-pane-files' }, [ this.filesNode ]);
		this.body = E('div', { 'class': 'shellbox-body' }, [
			this.termPane, this.splitter, this.filesPane
		]);

		try {
			var saved = window.localStorage.getItem(SPLIT_KEY);
			var parts = saved ? saved.split(':') : [];

			if (parts.length == 2 && parseFloat(parts[0]) > 0.15 && parseFloat(parts[0]) < 0.9) {
				this.termPane.style.flex = parts[0] + ' 1 0';
				this.filesPane.style.flex = parts[1] + ' 1 0';
			}
		}
		catch (e) { /* ignore */ }

		this.bindSplitter();

		btnReconnect.addEventListener('click', function() {
			if (self.term)
				self.term.reconnect();
		});

		btnClear.addEventListener('click', function() {
			if (self.term && self.term.term)
				self.term.term.clear();
		});


		dom.content(this.filesNode, this.files.render());

		vendor.load().then(function(libs) {
			self.term = new termlib.Terminal(self.termNode, {
				Terminal: libs.Terminal,
				FitAddon: libs.FitAddon,
				url: wsUrl(port, ssl),
				onState: function(state) { self.renderState(state); },
				onReady: function() { self.shellReady = true; },
				onTitle: function(title) { dom.content(self.titleText, title); },
				onCwd: function(path) { self.handleTermCwd(path); },
				onOptions: function(opts) { self.applyClientOptions(opts); }
			});

			window.setTimeout(function() { self.term.fitToContainer(); }, 50);
		}).catch(function(err) {
			dom.content(self.termNode, E('div', { 'class': 'alert-message error' },
				[ _('终端组件加载失败：') + err.message ]));
		});

		this.onUnload = function() {
			if (self.term)
				self.term.dispose();
		};

		window.addEventListener('beforeunload', this.onUnload);

		return E('div', { 'class': 'shellbox' }, [
			E('div', { 'class': 'shellbox-toolbar' }, [
				E('span', { 'class': 'shellbox-state' }, [ this.stateDot, ' ', this.stateText ]),
				this.titleText,
				E('span', { 'style': 'margin-left:auto; display:flex; gap:.3em; align-items:center' }, [
					_('搜索：'), this.files.filterInput(),
					btnClear, btnReconnect
				])
			]),
			this.body
		]);
	},

	renderState: function(state) {
		if (state != 'open')
			this.shellReady = false;

		var text = {
			connecting: _('连接中…'),
			open: _('已连接'),
			closed: _('已断开')
		}[state] || state;

		dom.content(this.stateText, text);
		this.stateDot.className = 'shellbox-dot shellbox-dot-' + state;
	},

	handlePanelPath: function(path) {
		if (!this.linkCwd || !this.shellReady || !this.term || this.term.state != 'open')
			return;

		this.term.handleInput('cd -- ' + shellQuote(path) + '\r');
		this.term.focus();
	},

	handleTermCwd: function(path) {
		if (!this.linkCwd || !this.shellReady || !path || !this.files)
			return;

		if (path == this.files.path)
			return;

		this.files.setPath(path, true);
	},

	applyClientOptions: function(opts) {
		if (!opts || !this.term || !this.term.term)
			return;

		var size = parseInt(opts.fontSize, 10);

		if (size >= 6 && size <= 40 && size != this.term.term.options.fontSize) {
			this.term.term.options.fontSize = size;
			this.term.fitToContainer();
		}
	},

	bindSplitter: function() {
		var self = this;
		var dragging = false;

		var apply = function(clientX) {
			var rect = self.body.getBoundingClientRect();
			var ratio = (clientX - rect.left) / rect.width;

			if (ratio < 0.15 || ratio > 0.9)
				return;

			self.termPane.style.flex = ratio + ' 1 0';
			self.filesPane.style.flex = (1 - ratio) + ' 1 0';

			if (self.term)
				self.term.fitToContainer();
		};

		this.splitter.addEventListener('mousedown', function(ev) {
			dragging = true;
			ev.preventDefault();
			document.body.style.userSelect = 'none';
		});

		window.addEventListener('mousemove', function(ev) {
			if (dragging)
				apply(ev.clientX);
		});

		window.addEventListener('mouseup', function() {
			if (!dragging)
				return;

			dragging = false;
			document.body.style.userSelect = '';

			try {
				window.localStorage.setItem(SPLIT_KEY,
					parseFloat(self.termPane.style.flex) + ':' + parseFloat(self.filesPane.style.flex));
			}
			catch (e) { /* ignore */ }

			if (self.term)
				self.term.fitToContainer();
		});
	}
});
