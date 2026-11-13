// SPDX-License-Identifier: Apache-2.0

'use strict';
'require fs';
'require view';

function row(title, value, attrs) {
	var td = E('td', { 'class': 'td left' },
		value != null && value !== '' ? value : '—');

	if (attrs && attrs.title)
		td.title = attrs.title;

	return E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td left', 'width': '33%' }, title),
		td
	]);
}

function section(title, rows) {
	return E('div', {}, [
		E('h3', {}, title),
		E('table', { 'class': 'table' }, rows)
	]);
}

function shortPath(path) {
	if (!path)
		return null;

	var parts = String(path).split('/').filter(function(part) {
		return part.length > 0;
	});

	return parts.length ? parts[parts.length - 1] : path;
}

function calibrationRow(label, purpose, data) {
	var present = !!(data && data.valid);
	var fingerprint = present && data.sha256 ? data.sha256.slice(0, 12) : '—';

	return E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td left', 'width': '12%' }, label),
		E('td', { 'class': 'td left', 'width': '15%' },
			present ? _('存在') : _('不存在')),
		E('td', { 'class': 'td left', 'width': '38%' }, purpose),
		E('td', { 'class': 'td left' },
			present ? E('code', { title: data.sha256 || '' }, fingerprint) : '—')
	]);
}

function calibrationTable(cal) {
	var a0 = cal.a0 || {};
	var a2 = cal.a2 || {};

	if (!a0.valid && !a2.valid)
		return null;

	return E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr' }, [
			E('th', { 'class': 'th left', 'width': '12%' }, _('区域')),
			E('th', { 'class': 'th left', 'width': '15%' }, _('状态')),
			E('th', { 'class': 'th left', 'width': '38%' }, _('用途')),
			E('th', { 'class': 'th left' }, _('校准指纹'))
		]),
		calibrationRow('A0', _('10G-EPON 校准'), a0),
		calibrationRow('A2', _('GPON / XG-PON / XGS-PON 校准'), a2)
	]);
}

function calibrationTile() {
	return E('div', {
		'style': 'margin: 0.75rem 0; padding: 1rem 1.25rem; ' +
			'border: 1px solid rgba(229, 72, 77, 0.55); ' +
			'border-left: 4px solid #e5484d; ' +
			'border-radius: 0.75rem; ' +
			'background: rgba(229, 72, 77, 0.10); ' +
			'color: #e5484d;'
	}, [
		E('div', {
			'style': 'font-weight: 600; font-size: 1rem; color: #e5484d;'
		}, _('光校准未加载')),
		E('div', {
			'style': 'margin-top: 0.25rem; opacity: 0.8; font-size: 0.875rem; color: #e5484d;'
		}, _('当前 factory 中没有有效的 A0/A2 校准数据。'))
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
		var cal = info.calibration || {};
		var calTable = calibrationTable(cal);

		return E('div', {}, [
			section(_('设备硬件信息'), [
				row(_('型号'), info.model_name),
				row(_('PON 序列号'), sn.value),
				row(_('PON MAC'), mac.value),
				row(_('nvmem cell'), shortPath(cal.path), { title: cal.path }),
				row(_('大小'), cal.size ? (cal.size + ' bytes') : null),
				row(_('SHA-256'), cal.sha256)
			]),
			section(_('Factory 分区'), [
				row(_('MTD 名称'), 'factory'),
				row(_('MTD 序号'), info.factory_index),
				row(_('大小'), info.factory_size ? (info.factory_size + ' bytes') : null),
				row(_('SHA-256'), info.factory_sha256)
			]),
			calTable
				? E('div', {}, [
					E('h3', {}, _('光校准数据')),
					calTable,
					E('p', {
						'style': 'margin-top: 0.5rem; opacity: 0.7; font-size: 0.875rem;'
					}, _('指纹基于各区 0x80–0xd7 校准区（88 字节）计算。'))
				])
				: E('div', {}, [
					E('h3', {}, _('光校准数据')),
					calibrationTile()
				])
		]);
	}
});
