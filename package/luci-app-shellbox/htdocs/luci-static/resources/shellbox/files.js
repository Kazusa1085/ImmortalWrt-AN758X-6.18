'use strict';
'require fs';
'require dom';
'require ui';

// shellbox/files.js —— 右侧文件面板
//
// 面板自己管自己的 DOM / 状态 / 弹窗，视图只负责把它摆到右边、收 path 变化回调。
// 需要特权的操作（新建/重命名/删除/打包/解压/校验和/装 apk）走 helper
// /usr/sbin/shellbox-ctl，ACL 里按完整命令行逐条白名单放行；
// 上传/下载走 cgi-io。

var CTL = '/usr/sbin/shellbox-ctl';

var PAGE_SIZES = [ 25, 50, 100, 200 ];
var ARCHIVE_RE = /\.(zip|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2|tbz|tar)$/i;
var APK_RE = /\.apk$/i;

function joinPath(dir, name) {
	return (dir == '/' ? '' : dir) + '/' + name;
}

function dirName(p) {
	var i = p.lastIndexOf('/');

	return (i <= 0) ? '/' : p.substring(0, i);
}

function fmtSize(n) {
	if (n == null)
		return '-';
	if (n < 1024)
		return n + ' B';
	if (n < 1024 * 1024)
		return (n / 1024).toFixed(1) + ' KB';
	if (n < 1024 * 1024 * 1024)
		return (n / 1024 / 1024).toFixed(1) + ' MB';

	return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function fmtTime(t) {
	if (!t)
		return '-';

	var d = new Date(t * 1000);

	return '%02d-%02d %02d:%02d'.format(
		d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
}

function lastLine(s) {
	var lines = String(s || '').replace(/\s+$/, '').split('\n');

	return lines[lines.length - 1] || '';
}

var Files = L.Class.extend({
	__name__: 'Shellbox.Files',

	/* opts: { path, onPathChange(path) } */
	__init__: function(opts) {
		this.opts = opts || {};
		this.path = this.opts.path || '/tmp/upload';
		this.entries = [];
		this.sortKey = 'name';
		this.sortAsc = true;
		this.filter = '';
		this.page = 1;
		this.perPage = this.opts.perPage || 50;
		this.error = '';
	},

	/* ------------------------------------------------------------ 数据 -- */

	setPath: function(path, silent) {
		if (!path)
			return Promise.resolve();

		this.path = path;
		this.page = 1;
		this.renderPath();

		if (!silent && this.opts.onPathChange)
			this.opts.onPathChange(path);

		return this.reload();
	},

	reload: function() {
		var self = this;

		return fs.list(this.path).then(function(entries) {
			self.entries = entries || [];
			self.error = '';
		}, function(err) {
			self.entries = [];
			self.error = String(err && err.message ? err.message : err);
		}).then(function() {
			self.renderBody();
			return self.entries;
		});
	},

	setStatus: function(msg, isError) {
		if (!this.statusNode)
			return;

		dom.content(this.statusNode, msg || '');
		this.statusNode.style.color = isError ? '#c0392b' : '';
	},

	/* ------------------------------------------------------------ 通用 -- */

	showText: function(title, text) {
		var self = this;
		var pre = E('pre', {
			'style': 'white-space:pre-wrap; word-break:break-all; max-height:50vh; ' +
				'overflow:auto; margin:0'
		}, text);

		ui.showModal(title, [
			pre,
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'type': 'button', 'click': ui.hideModal },
					[ _('关闭') ]),
				E('button', {
					'class': 'btn cbi-button-action', 'type': 'button',
					'click': function() { return self.copyText(text); }
				}, [ _('复制') ])
			])
		]);
	},

	copyText: function(text) {
		if (navigator.clipboard) {
			return navigator.clipboard.writeText(text).then(function() {
				ui.addNotification(null, E('p', {}, _('已复制')), 'info');
			}, function() {
				ui.addNotification(null, E('p', {}, _('复制失败，请手动选择')), 'warning');
			});
		}

		ui.addNotification(null, E('p', {}, _('复制失败，请手动选择')), 'warning');
		return Promise.resolve();
	},

	promptModal: function(title, label, value, onOk, okLabel) {
		var input = E('input', {
			'class': 'cbi-input-text', 'style': 'width:100%', 'value': value || ''
		});

		var close = function() { ui.hideModal(); };

		var submit = function() {
			var v = input.value.trim();

			if (!v)
				return;

			close();
			onOk(v);
		};

		input.addEventListener('keydown', function(ev) {
			if (ev.key == 'Enter')
				submit();
		});

		ui.showModal(title, [
			E('p', { 'style': 'margin:0 0 .3em 0' }, label),
			input,
			E('div', { 'class': 'right', 'style': 'margin-top:1em' }, [
				E('button', { 'class': 'btn', 'type': 'button', 'click': close }, [ _('取消') ]),
				E('button', {
					'class': 'btn cbi-button-action', 'type': 'button', 'click': submit
				}, [ okLabel || _('确定') ])
			])
		]);

		window.setTimeout(function() { input.focus(); }, 50);
	},

	confirmModal: function(title, body, okLabel, onOk) {
		var close = function() { ui.hideModal(); };

		ui.showModal(title, [
			E('p', {}, body),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'type': 'button', 'click': close }, [ _('取消') ]),
				E('button', {
					'class': 'btn cbi-button-negative', 'type': 'button',
					'click': function() { close(); onOk(); }
				}, [ okLabel || _('确定') ])
			])
		]);
	},

	/* 跑 helper（ubus file exec，适合快命令），完了刷新列表 */
	run: function(args, okMsg) {
		var self = this;

		this.setStatus(_('执行中…') + ' ' + args.join(' '));

		return fs.exec(CTL, args).then(function(res) {
			var out = ((res.stdout || '') + (res.stderr || '')).trim();

			if (res.code) {
				self.setStatus(_('失败：') + lastLine(out), true);
				ui.addNotification(null, E('p', {}, [
					E('strong', {}, args.join(' ')), E('br'), E('code', {}, out)
				]), 'danger');
			}
			else {
				self.setStatus(okMsg || lastLine(out) || _('完成'));
			}

			return self.reload().then(function() { return out; });
		}, function(err) {
			var msg = String(err && err.message ? err.message : err);

			self.setStatus(_('失败：') + msg, true);
			ui.addNotification(null, E('p', {}, msg), 'danger');
		});
	},

	/* 实时流式执行（cgi-exec）：输出一边产生一边刷进 <pre>，返回最终输出文本 */
	runStream: function(args, logNode) {
		var self = this;

		dom.content(logNode, '');
		this.setStatus(_('执行中…') + ' ' + args.join(' '));

		return fs.exec_direct(CTL, args, 'text', false, true, function(ev) {
			dom.content(logNode, ev.target.response || '');
			logNode.scrollTop = logNode.scrollHeight;
		}).then(function(res) {
			var out = (res != null) ? String(res) : '';

			dom.content(logNode, out);
			logNode.scrollTop = logNode.scrollHeight;
			self.setStatus(lastLine(out) || _('完成'));

			return self.reload().then(function() { return out; });
		}, function(err) {
			var msg = String(err && err.message ? err.message : err);

			dom.content(logNode, msg);
			self.setStatus(_('失败：') + msg, true);

			return self.reload().then(function() { return ''; });
		});
	},

	/* ------------------------------------------------------------ 上传 -- */

	uploadOne: function(file, dir, progressNode) {
		var self = this;
		var target = joinPath(dir, file.name);
		var bar = E('div', { 'style': 'height:.5em; background:#4b8; width:0; transition:width .15s' });
		var row = E('div', { 'style': 'margin:.3em 0' }, [
			E('div', {}, [ E('code', {}, file.name), ' ', E('span', {}, fmtSize(file.size)) ]),
			E('div', { 'style': 'background:#eee' }, [ bar ])
		]);

		if (progressNode)
			progressNode.appendChild(row);

		return new Promise(function(resolve, reject) {
			var fd = new FormData();

			/* 顺序重要：cgi-io 在看到 filedata 之前就要 sessionid + filename */
			fd.append('sessionid', L.env.sessionid);
			fd.append('filename', target);
			fd.append('filedata', file);

			var xhr = new XMLHttpRequest();

			xhr.open('POST', L.env.cgi_base + '/cgi-upload');

			xhr.upload.addEventListener('progress', function(ev) {
				if (ev.lengthComputable)
					bar.style.width = Math.round(ev.loaded / ev.total * 100) + '%';
			});

			xhr.addEventListener('load', function() {
				bar.style.width = '100%';

				if (xhr.status == 200) {
					self.setStatus(_('已上传：%s').format(file.name));
					resolve(target);
				}
				else {
					var msg = _('上传失败（HTTP %d）').format(xhr.status);

					self.setStatus(msg, true);
					reject(new Error(msg));
				}
			});

			xhr.addEventListener('error', function() {
				reject(new Error(_('上传失败（网络错误）')));
			});

			xhr.send(fd);
		});
	},

	uploadTo: function(files, dir, progressNode) {
		var self = this;

		if (!files.length) {
			ui.addNotification(null, E('p', {}, _('没有选择文件')), 'warning');
			return Promise.resolve();
		}

		return files.reduce(function(chain, f) {
			return chain.then(function() { return self.uploadOne(f, dir, progressNode); });
		}, Promise.resolve()).then(function() {
			return self.reload();
		}, function() {
			return self.reload();
		});
	},

	uploadModal: function(dropped) {
		var self = this;
		var pending = Array.prototype.slice.call(dropped || []);

		var target = E('input', {
			'class': 'cbi-input-text', 'style': 'width:100%',
			'value': this.path, 'placeholder': '/tmp/upload'
		});
		var fileInput = E('input', { 'type': 'file', 'multiple': 'multiple' });
		var listNode = E('div', { 'class': 'cbi-value-description' });
		var progressNode = E('div', { 'style': 'margin-top:.5em' });

		var btnStart = E('button', { 'class': 'btn cbi-button-action', 'type': 'button' },
			[ _('开始上传') ]);
		var btnClose = E('button', { 'class': 'btn', 'type': 'button' }, [ _('关闭') ]);

		var currentFiles = function() {
			return pending.length ? pending : Array.prototype.slice.call(fileInput.files || []);
		};

		var updateList = function() {
			var names = currentFiles().map(function(f) { return f.name; });

			dom.content(listNode, names.length ? _('待上传：') + names.join('、')
				: _('还没有选择文件（可以点选择框，或把文件拖到面板里）'));
		};

		fileInput.addEventListener('change', function() {
			pending = [];
			updateList();
		});

		btnClose.addEventListener('click', ui.hideModal);

		btnStart.addEventListener('click', function() {
			var files = currentFiles();
			var dir = (target.value || '').trim() || self.path;

			if (dir.charAt(0) != '/') {
				ui.addNotification(null, E('p', {}, _('目标目录必须是绝对路径')), 'warning');
				return;
			}

			btnStart.disabled = true;
			return self.uploadTo(files, dir, progressNode).then(function() {
				btnStart.disabled = false;
				updateList();
			});
		});

		ui.showModal(_('上传文件'), [
			E('p', { 'style': 'margin:0 0 .2em 0' }, _('目标目录：')),
			target,
			E('div', { 'style': 'margin:.6em 0' }, [ fileInput ]),
			listNode,
			progressNode,
			E('div', { 'class': 'right', 'style': 'margin-top:.8em' }, [ btnClose, ' ', btnStart ])
		]);

		updateList();
	},

	/* ------------------------------------------------------------ 下载 -- */

	downloadForm: function(path, name) {
		var form = E('form', {
			'method': 'post',
			'action': L.env.cgi_base + '/cgi-download',
			'enctype': 'application/x-www-form-urlencoded'
		}, [
			E('input', { 'type': 'hidden', 'name': 'sessionid', 'value': L.env.sessionid }),
			E('input', { 'type': 'hidden', 'name': 'path', 'value': path }),
			E('input', { 'type': 'hidden', 'name': 'filename', 'value': name })
		]);

		document.body.appendChild(form);
		form.submit();
		document.body.removeChild(form);
	},

	download: function(e) {
		var self = this;
		var path = joinPath(this.path, e.name);

		if (e.type != 'directory') {
			this.downloadForm(path, e.name);
			return Promise.resolve();
		}

		var out = '/tmp/shellbox-' + Date.now() + '.tar.gz';
		var log = E('pre', {
			'style': 'white-space:pre-wrap; max-height:35vh; overflow:auto; margin:0'
		}, '');

		ui.showModal(_('打包 %s').format(e.name), [
			E('p', { 'class': 'cbi-value-description' },
				_('目录会打成一个 tar.gz，完成后自动开始下载。')),
			log,
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'type': 'button', 'click': ui.hideModal },
					[ _('关闭') ])
			])
		]);

		return this.runStream([ 'pack', path, out ], log).then(function(text) {
			if (/^packed=/m.test(text)) {
				ui.hideModal();
				self.downloadForm(out, e.name + '.tar.gz');
			}
		});
	},

	/* ------------------------------------------------------------ 操作 -- */

	createDir: function() {
		var self = this;

		this.promptModal(_('新建目录'), _('目录名（建在当前目录下）'), '', function(name) {
			if (name.indexOf('/') >= 0)
				return ui.addNotification(null, E('p', {}, _('目录名不能包含 /')), 'warning');

			return self.run([ 'mkdir', joinPath(self.path, name) ], _('目录已创建'));
		});
	},

	rename: function(e) {
		var self = this;

		this.promptModal(_('重命名'), _('新名称'), e.name, function(name) {
			if (name == e.name)
				return;

			return self.run([ 'mv', joinPath(self.path, e.name), joinPath(self.path, name) ],
				_('已重命名'));
		}, _('重命名'));
	},

	remove: function(e) {
		var self = this;
		var path = joinPath(this.path, e.name);
		var isDir = (e.type == 'directory');

		this.confirmModal(_('删除'), [
			_('确定要删除 %s 吗？').format(E('strong', {}, e.name)),
			isDir ? E('div', { 'class': 'cbi-value-description' },
				_('目录里的内容会一起删除，且不可恢复。')) : ''
		], _('删除'), function() {
			return self.run([ 'rm', path ], _('已删除'));
		});
	},

	unpack: function(e) {
		var self = this;
		var file = joinPath(this.path, e.name);
		var target = file.replace(ARCHIVE_RE, '');

		this.promptModal(_('解压'), _('解压到（不存在会创建）'), target, function(dest) {
			var log = E('pre', {
				'style': 'white-space:pre-wrap; max-height:45vh; overflow:auto; margin:0'
			}, '');

			ui.showModal(_('解压 %s').format(e.name), [
				E('p', {}, _('目标目录：') + ' ', E('code', {}, dest)),
				log,
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn', 'type': 'button', 'click': ui.hideModal },
						[ _('关闭') ])
				])
			]);

			return self.runStream([ 'unpack', file, dest ], log);
		}, _('开始解压'));
	},

	checksum: function(e) {
		var self = this;
		var file = joinPath(this.path, e.name);

		this.setStatus(_('正在计算校验和…'));

		return fs.exec(CTL, [ 'checksum', 'sha256', file ]).then(function(res) {
			return fs.exec(CTL, [ 'checksum', 'md5', file ]).then(function(res2) {
				self.setStatus(_('完成'));
				self.showText(_('校验和 - %s').format(e.name),
					(res.stdout || '').trim() + '\n' + (res2.stdout || '').trim());
			});
		}, function(err) {
			var msg = String(err && err.message ? err.message : err);

			self.setStatus(_('失败：') + msg, true);
			ui.addNotification(null, E('p', {}, msg), 'danger');
		});
	},

	install: function(e) {
		var self = this;
		var file = joinPath(this.path, e.name);
		var simulate = E('input', { 'type': 'checkbox', 'checked': 'checked' });
		var log = E('pre', {
			'style': 'white-space:pre-wrap; max-height:40vh; overflow:auto; margin:0; ' +
				'background:#1b1b1b; color:#e8e8e8; border:1px solid #444; padding:.4em'
		}, '');
		var btnPreview = E('button', { 'class': 'btn', 'type': 'button' }, [ _('预览（--simulate）') ]);
		var btnInstall = E('button', { 'class': 'btn cbi-button-negative', 'type': 'button' }, [ _('开始安装') ]);
		var btnClose = E('button', { 'class': 'btn', 'type': 'button' }, [ _('关闭') ]);

		var args = function(preview) {
			var a = [ 'apk', 'add', '--allow-untrusted' ];
			if (preview || simulate.checked)
				a.push('--simulate');
			a.push(file);
			return a;
		};

		var runIt = function(preview) {
			btnPreview.disabled = true;
			btnInstall.disabled = true;
			simulate.checked = !!preview;
			return self.runStream(args(preview), log).then(function() {
				btnPreview.disabled = false;
				btnInstall.disabled = false;
				if (!preview)
					ui.addNotification(null, E('p', {}, _('安装结束，详见日志')), 'info');
			});
		};

		btnPreview.addEventListener('click', function() { return runIt(true); });
		btnInstall.addEventListener('click', function() { return runIt(false); });
		btnClose.addEventListener('click', ui.hideModal);

		ui.showModal(_('安装 apk - %s').format(e.name), [
			E('div', { 'class': 'cbi-value-description' }, [
				_('使用系统 apk 安装本地包；本固件的软件源可能不可达，依赖需要事先装好。'),
				E('br'),
				_('建议先点“预览（--simulate）”。')
			]),
			E('div', { 'style': 'margin:.6em 0' }, [ E('label', {}, [ simulate, ' ', _('--simulate') ]) ]),
			log,
			E('div', { 'class': 'right', 'style': 'margin-top:.8em' },
				[ btnClose, ' ', btnPreview, ' ', btnInstall ])
		]);
	},

	/* 单个条目的操作面板：窄栏里比一排按钮好看，也让每行 DOM 更小（1000 项也流畅） */
	actions: function(e) {
		var self = this;
		var isDir = (e.type == 'directory');
		var isArchive = !isDir && ARCHIVE_RE.test(e.name);
		var isApk = !isDir && APK_RE.test(e.name);
		var path = joinPath(this.path, e.name);

		var buttons = [
			E('button', {
				'class': 'btn cbi-button', 'type': 'button',
				'click': function() { ui.hideModal(); return self.download(e); }
			}, [ isDir ? _('打包下载') : _('下载') ])
		];

		if (isArchive)
			buttons.push(E('button', {
				'class': 'btn cbi-button', 'type': 'button',
				'click': function() { ui.hideModal(); return self.unpack(e); }
			}, [ _('解压') ]));

		if (isApk)
			buttons.push(E('button', {
				'class': 'btn cbi-button-action', 'type': 'button',
				'click': function() { ui.hideModal(); return self.install(e); }
			}, [ _('安装 apk') ]));

		buttons.push(E('button', {
			'class': 'btn cbi-button', 'type': 'button',
			'click': function() { ui.hideModal(); return self.checksum(e); }
		}, [ _('md5/sha256') ]));

		if (!isDir) {
			buttons.push(E('button', {
				'class': 'btn cbi-button', 'type': 'button',
				'click': function() { ui.hideModal(); return self.rename(e); }
			}, [ _('重命名') ]));
		}

		buttons.push(E('button', {
			'class': 'btn cbi-button-negative', 'type': 'button',
			'click': function() { ui.hideModal(); return self.remove(e); }
		}, [ _('删除') ]));

		ui.showModal(isDir ? _('目录：%s').format(e.name) : _('文件：%s').format(e.name), [
			E('div', { 'class': 'cbi-value-description' }, [
				E('code', {}, path), E('br'),
				isDir ? _('目录') : fmtSize(e.size) + ' · ' + fmtTime(e.mtime)
			]),
			E('div', { 'style': 'display:flex; flex-wrap:wrap; gap:.4em; margin:.8em 0' }, buttons),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'type': 'button', 'click': ui.hideModal },
					[ _('关闭') ])
			])
		]);
	},

	/* ------------------------------------------------------------ 渲染 -- */

	render: function() {
		var self = this;

		this.pathBar = E('div', {
			'class': 'shellbox-pathbar',
			'title': _('点击路径或编辑按钮输入目录')
		});

		this.tbody = E('tbody');
		this.countNode = E('span', { 'class': 'cbi-value-description' });
		this.pagerNode = E('span');
		this.statusNode = E('div', { 'class': 'cbi-value-description' });

		var topRow = E('div', { 'class': 'shellbox-files-top' }, [
			E('button', {
				'class': 'btn cbi-button', 'title': _('上一级'),
				'click': function() { return self.setPath(dirName(self.path)); }
			}, [ '⬆' ]),
			this.pathBar,
			E('button', {
				'class': 'btn cbi-button', 'click': function() { return self.reload(); }
			}, [ _('刷新') ])
		]);

		var actionRow = E('div', { 'class': 'shellbox-files-actions' }, [
			E('button', {
				'class': 'btn cbi-button-action',
				'click': function() { return self.uploadModal(null); }
			}, [ _('上传') ]),
			E('button', {
				'class': 'btn cbi-button',
				'click': function() { return self.createDir(); }
			}, [ _('新建目录') ]),
			E('span', { 'style': 'margin-left:auto' }, [ this.countNode ])
		]);

		var head = E('div', { 'class': 'shellbox-files-head' }, [ topRow, actionRow ]);

		var tableNode = E('div', { 'class': 'shellbox-files-table' }, [
			E('table', { 'class': 'table' }, [
				E('thead', {}, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th col-name' }, [ this.sortLink(_('名称'), 'name') ]),
						E('th', { 'class': 'th col-size' }, [ this.sortLink(_('大小'), 'size') ]),
						E('th', { 'class': 'th col-time' }, [ this.sortLink(_('时间'), 'mtime') ]),
						E('th', { 'class': 'th col-actions' }, [ '' ])
					])
				]),
				this.tbody
			])
		]);

		var dropZone = E('div', { 'class': 'shellbox-files' }, [
			head,
			tableNode,
			E('div', { 'class': 'shellbox-files-pager' }, [ this.pagerNode ]),
			this.statusNode
		]);

		[ 'dragenter', 'dragover' ].forEach(function(ev) {
			dropZone.addEventListener(ev, function(e) {
				e.preventDefault();
				dropZone.style.outline = '2px dashed #4b8';
			});
		});

		[ 'dragleave', 'drop' ].forEach(function(ev) {
			dropZone.addEventListener(ev, function(e) {
				e.preventDefault();
				dropZone.style.outline = '';
			});
		});

		dropZone.addEventListener('drop', function(ev) {
			if (ev.dataTransfer && ev.dataTransfer.files)
				return self.uploadModal(ev.dataTransfer.files);
		});

		this.pathBar.addEventListener('click', function(ev) {
			if (ev.target.closest('a,button,input'))
				return;
			self.editPath();
		});

		this.renderPath();
		this.reload();

		return dropZone;
	},

	sortLink: function(label, key) {
		var self = this;

		return E('a', {
			'href': '#',
			'click': function(ev) {
				ev.preventDefault();

				if (self.sortKey == key)
					self.sortAsc = !self.sortAsc;
				else {
					self.sortKey = key;
					self.sortAsc = true;
				}

				self.renderBody();
			}
		}, [ label, (this.sortKey == key) ? (this.sortAsc ? ' ↑' : ' ↓') : '' ]);
	},

	renderPath: function() {
		var self = this;

		if (!this.pathBar)
			return;

		/* 1Panel-style address bar: home icon, then clickable path segments. */
		var nodes = [
			E('a', {
				'href': '#',
				'class': 'shellbox-path-home',
				'title': _('根目录'),
				'click': function(ev) {
					ev.preventDefault();
					return self.setPath('/');
				}
			}, [ '⌂' ])
		];

		var acc = '';

		this.path.split('/').filter(function(part) { return part.length > 0; }).forEach(function(part) {
			acc += '/' + part;

			var target = acc;

			nodes.push(E('span', { 'class': 'shellbox-path-arrow' }, [ '>' ]));
			nodes.push(E('a', {
				'href': '#',
				'class': 'shellbox-path-seg',
				'title': target,
				'click': function(ev) {
					ev.preventDefault();
					return self.setPath(target);
				}
			}, part));
		});

		dom.content(this.pathBar, nodes);
	},

	renderBody: function() {
		var self = this;
		var entries = this.entries.slice();
		var filter = this.filter.toLowerCase();

		if (filter)
			entries = entries.filter(function(e) { return e.name.toLowerCase().indexOf(filter) >= 0; });

		var key = this.sortKey;
		var asc = this.sortAsc ? 1 : -1;

		entries.sort(function(a, b) {
			var da = (a.type == 'directory') ? 0 : 1;
			var db = (b.type == 'directory') ? 0 : 1;

			if (da != db)
				return da - db;

			var va, vb;

			switch (key) {
			case 'size':  va = a.size || 0; vb = b.size || 0; break;
			case 'mtime': va = a.mtime || 0; vb = b.mtime || 0; break;
			default:      va = a.name.toLowerCase(); vb = b.name.toLowerCase();
			}

			return (va < vb) ? -asc : (va > vb) ? asc : 0;
		});

		var total = entries.length;
		var pages = Math.max(1, Math.ceil(total / this.perPage));

		if (this.page > pages)
			this.page = pages;

		var start = (this.page - 1) * this.perPage;
		var rows = entries.slice(start, start + this.perPage).map(function(e) {
			var isDir = (e.type == 'directory');
			var name = E('a', {
				'href': '#',
				'style': isDir ? 'font-weight:bold' : '',
				'click': function(ev) {
					ev.preventDefault();

					if (isDir)
						return self.setPath(joinPath(self.path, e.name));

					return self.actions(e);
				}
			}, [ (isDir ? '📁 ' : '📄 ') + e.name ]);

			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td col-name' }, [ name ]),
				E('td', { 'class': 'td col-size' }, [ isDir ? '-' : fmtSize(e.size) ]),
				E('td', { 'class': 'td col-time' }, [ fmtTime(e.mtime) ]),
				E('td', { 'class': 'td col-actions' }, [
					E('button', {
						'class': 'btn cbi-button', 'title': _('操作'),
						'click': function() { return self.actions(e); }
					}, [ '⋯' ])
				])
			]);
		});

		if (!rows.length) {
			rows.push(E('tr', { 'class': 'tr placeholder' }, [
				E('td', { 'class': 'td', 'colspan': 4 },
					this.error ? _('读取失败：') + this.error : _('（空目录）'))
			]));
		}

		dom.content(this.tbody, rows);
		dom.content(this.countNode, _('%d 项 · %d/%d 页').format(total, this.page, pages));
		dom.content(this.pagerNode, [
			E('button', {
				'class': 'btn', 'disabled': (this.page <= 1) ? 'disabled' : null,
				'click': function() { self.page--; self.renderBody(); }
			}, [ _('上一页') ]),
			' ',
			E('button', {
				'class': 'btn', 'disabled': (this.page >= pages) ? 'disabled' : null,
				'click': function() { self.page++; self.renderBody(); }
			}, [ _('下一页') ])
		]);
	},

	/* 过滤/每页：给视图工具栏用（窄栏里放不下就挪到上面） */
	filterInput: function() {
		var self = this;
		var input = E('input', {
			'class': 'cbi-input-text', 'style': 'width:7em', 'placeholder': _('搜索…')
		});

		input.addEventListener('input', function() {
			self.filter = input.value;
			self.page = 1;
			self.renderBody();
		});

		return input;
	},

	perPageSelect: function() {
		var self = this;
		var select = E('select', { 'class': 'cbi-input-select' }, PAGE_SIZES.map(function(n) {
			return E('option', { 'value': n, 'selected': (n == self.perPage) ? 'selected' : null },
				[ n ]);
		}));

		select.addEventListener('change', function() {
			self.perPage = parseInt(select.value) || 50;
			self.page = 1;
			self.renderBody();
		});

		return select;
	}
});

/* LuCI 模块约定：工厂返回 L.Class（loader 自己 new 一个单例），
 * 真正的面板类是实例上的 Panel，视图用 new files.Panel({ path, onPathChange }) 建。 */
return L.Class.extend({
	__name__: 'ShellboxFiles',

	Panel: Files
});
