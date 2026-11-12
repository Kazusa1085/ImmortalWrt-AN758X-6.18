'use strict';

'require form';
'require uci';
'require view';

return view.extend({
	load: function() {
		return uci.load('shellbox');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('shellbox', _('ShellBox'),
			_('终端与文件服务的运行参数，保存并应用后自动重启实例。'));

		s = m.section(form.NamedSection, 'main', 'shellbox', _('实例设置'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('启用终端实例'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'bind', _('监听范围'));
		o.default = 'lan';
		o.value('lan', _('仅 LAN（br-lan）'));
		o.value('all', _('所有接口（0.0.0.0）'));
		o.description = _('默认只监听 LAN，WAN 无法直接访问；选择所有接口前请确认防火墙已拒绝 WAN 入站。');

		o = s.option(form.Value, 'port', _('监听端口'));
		o.datatype = 'port';
		o.default = '7682';
		o.rmempty = false;
		o.description = _('固件自带的 ttyd 通常占 7681，默认避开它。');

		o = s.option(form.Value, 'command', _('终端里运行的命令'));
		o.default = '/bin/login';
		o.rmempty = false;
		o.description = _('默认 /bin/login，需要 root 密码；改成 /bin/sh 会跳过登录认证，慎重。');


		o = s.option(form.Value, 'font_size', _('终端字号'));
		o.datatype = 'uinteger';
		o.default = '14';
		o.rmempty = false;

		o = s.option(form.Flag, 'ssl', _('启用 TLS'));
		o.default = '0';
		o.description = _('页面走 https 时必须开启，否则浏览器不允许 https 页面连接 ws://。');

		o = s.option(form.Value, 'ssl_cert', _('证书路径'));
		o.depends('ssl', '1');
		o.rmempty = true;

		o = s.option(form.Value, 'ssl_key', _('私钥路径'));
		o.depends('ssl', '1');
		o.rmempty = true;

		o = s.option(form.Flag, 'check_origin', _('只允许同源 WebSocket（ttyd -O）'));
		o.default = '0';
		o.description = _('页面和终端在不同端口时属于不同源，开启后普通访问会连不上；只有用反向代理合并端口时才开。');

		o = s.option(form.Value, 'max_clients', _('最大客户端数'));
		o.datatype = 'uinteger';
		o.default = '0';
		o.description = _('0 = 不限制。');

		o = s.option(form.Flag, 'zmodem', _('启用 zmodem（需要 lrzsz）'));
		o.default = '0';

		o = s.option(form.ListValue, 'per_page', _('文件列表每页条数'));
		o.default = '50';
		o.value('20', '20');
		o.value('50', '50');
		o.value('100', '100');
		o.value('200', '200');
		o.description = _('仅影响文件面板每页显示数量，不改变文件本身。');

		o = s.option(form.Flag, 'link_cwd', _('默认打开目录联动'));
		o.default = '0';
		o.description = _('打开后终端和文件面板的当前目录会互相同步。');

		return m.render();
	}
});
