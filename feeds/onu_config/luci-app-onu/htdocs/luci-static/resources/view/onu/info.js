// SPDX-License-Identifier: Apache-2.0

'use strict';
'require fs';
'require view';

function row(title, value) {
	return E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td left', 'width': '33%' }, title),
		E('td', { 'class': 'td left' }, value != null && value !== '' ? value : '—')
	]);
}

function section(title, rows) {
	return E('div', {}, [
		E('h3', {}, title),
		E('table', { 'class': 'table' }, rows)
	]);
}

return view.extend({
	load: function() {
		return fs.exec_direct('/usr/libexec/onu-hwinfo').catch(function() { return ''; });
	},

	render: function(output) {
		var info = {};

		try { info = JSON.parse(output); } catch (e) {}

		var fields = info.fields || {};
		var sn = fields.pon_sn || {};
		var mac = fields.pon_mac || {};

		return E('div', {}, [
			section(_('设备信息'), [
				row(_('型号'), info.model_name),
				row(_('PON 序列号'), sn.value),
				row(_('PON MAC'), mac.value)
			]),
			section(_('Factory 分区'), [
				row(_('MTD 名称'), 'factory'),
				row(_('MTD 序号'), info.factory_index),
				row(_('大小'), info.factory_size ? (info.factory_size + ' bytes') : null),
				row(_('SHA-256'), info.factory_sha256)
			]),
			section(_('光校准'), [
				row(_('nvmem cell'), (info.calibration || {}).path),
				row(_('大小'), (info.calibration || {}).size ? ((info.calibration || {}).size + ' bytes') : null),
				row(_('SHA-256'), (info.calibration || {}).sha256),
				row(_('起始数据'), (info.calibration || {}).hex ? E('code', {}, (info.calibration || {}).hex) : null)
			])
		]);
	}
});
