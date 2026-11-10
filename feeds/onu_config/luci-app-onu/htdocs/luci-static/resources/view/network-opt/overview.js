// SPDX-License-Identifier: Apache-2.0

'use strict';
'require fs';
'require form';
'require uci';
'require view';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('firewall'),
			uci.load('network-opt'),
			L.resolveDefault(fs.exec('/usr/libexec/network-opt-status'), '')
		]);
	},

	render: function(data) {
		var status = data[2] || '';
		var m, m2, s, o;

		m = new form.Map('firewall', _('网络优化'), _('Airoha 硬件加速与防火墙卸载设置。'));

		s = m.section(form.NamedSection, '@defaults[0]', 'defaults', _('Airoha PPE Offload'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'flow_offloading_hw', _('启用硬件流量卸载'),
			_('把已建立的 TCP/UDP 流交给 Airoha PPE。关闭后使用普通内核转发。'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'fullcone', _('FullCone NAT'), _('IPv4 全锥形 NAT。'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'fullcone6', _('FullCone NAT6'), _('IPv6 全锥形 NAT。'));
		o.default = '0';

		o = s.option(form.ListValue, 'tcpcca', _('TCP 拥塞控制算法'));
		o.default = 'cubic';
		o.value('cubic', 'CUBIC');
		o.value('bbr', 'BBR');

		m2 = new form.Map('network-opt', _('SFP 端口速率'),
			_('修改 SFP 端口链路速率。线缆/模块不支持时会在超时后自动回滚。'));

		s = m2.section(form.NamedSection, 'settings', 'settings', _('SFP 端口'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.ListValue, 'sfp_speed', _('速率模式'));
		o.default = 'auto';
		o.value('auto', _('自动'));
		o.value('1000', _('强制 1Gbps'));
		o.value('2500', _('强制 2.5Gbps'));
		o.value('10000', _('强制 10Gbps'));

		return Promise.all([m.render(), m2.render()]).then(function(nodes) {
			return E('div', {}, [
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('运行状态')),
					E('div', { 'class': 'cbi-section-node' }, E('pre', { 'style': 'white-space: pre-wrap; overflow-x: auto' }, status))
				]),
				nodes[0],
				nodes[1]
			]);
		});
	}
});
