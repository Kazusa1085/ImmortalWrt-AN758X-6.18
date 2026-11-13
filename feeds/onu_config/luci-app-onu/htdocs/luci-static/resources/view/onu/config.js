// SPDX-License-Identifier: Apache-2.0

'use strict';
'require form';
'require fs';
'require uci';
'require view';
/* Printable ASCII keeps JavaScript character counts equal to wire byte counts. */
function validatePrintableAscii(value, minimum, maximum) {
	if (value == null || value === '')
		return true;

	if (!/^[\x20-\x7e]+$/.test(value))
		return _('Only printable ASCII characters are allowed.');

	if (value.length < minimum || value.length > maximum) {
		if (minimum === maximum)
			return _('The value must contain exactly %d bytes.').format(maximum);

		return _('The value must contain between %d and %d bytes.')
			.format(minimum, maximum);
	}

	return true;
}

function asciiLength(minimum, maximum) {
	return function(sectionId, value) {
		return validatePrintableAscii(value, minimum, maximum);
	};
}


var LINE_MODE_DEFS = [
	{ value: 'xgpon', label: _('XG-PON 10G/2.5G'), gpon: true },
	{ value: 'xgspon', label: _('XGS-PON 10G/10G'), gpon: true },
	{ value: 'epon-10g-1g', label: _('10G-EPON 10G/1G'), gpon: false },
	{ value: 'epon-10g-10g', label: _('10G-EPON 10G/10G'), gpon: false }
];

function lineModeLabel(mode) {
	for (var i = 0; i < LINE_MODE_DEFS.length; i++)
		if (LINE_MODE_DEFS[i].value === mode)
			return LINE_MODE_DEFS[i].label;

	return mode;
}

function currentLineMode() {
	var lines = uci.sections('pon', 'xpon') || [];

	for (var i = 0; i < lines.length; i++) {
		var sid = lines[i].name || lines[i]['.name'] || lines[i].sid;
		var mode = uci.get('pon', sid, 'mode');

		if (mode)
			return mode;
	}

	return '';
}

function calibrationCapabilities(output) {
	var info = {};

	try { info = JSON.parse(output || '{}'); } catch (e) {}
	var cal = info.calibration || {};

	return {
		a0: !!(cal.a0 && cal.a0.valid),
		a2: !!(cal.a2 && cal.a2.valid)
	};
}

function allowedLineModes(cap) {
	if (cap.a0 && !cap.a2)
		return LINE_MODE_DEFS.filter(function(m) { return !m.gpon; })
			.map(function(m) { return m.value; });

	if (!cap.a0 && cap.a2)
		return LINE_MODE_DEFS.filter(function(m) { return m.gpon; })
			.map(function(m) { return m.value; });

	return LINE_MODE_DEFS.map(function(m) { return m.value; });
}

function isEponMode(mode) {
	return (mode || '').indexOf('epon-') === 0;
}

function sectionUsesEpon(sectionId) {
	var line = uci.get('pon', sectionId, 'line');

	return isEponMode(uci.get('pon', line, 'mode'));
}

/*
 * The OMCI and EPON OAM identity blocks are both registered on the map, but only
 * one matches the selected line mode. The section filter already drops the inner
 * fields of the irrelevant block, yet LuCI still renders its card with the
 * "no configuration available" placeholder. Hide the whole card so the user
 * never sees the empty block; visibility tracks the Line mode dropdown.
 */
function modeSectionCard(node, name) {
	var card = node.querySelector('#cbi-pon-' + name) ||
		node.querySelector('[id^="cbi-pon-' + name + '"]');

	return card ? (card.closest('.cbi-section') || card) : null;
}

function toggleModeSections(node, modeOption) {
	var omci = modeSectionCard(node, 'omci');
	var oam = modeSectionCard(node, 'oam');

	function readMode() {
		/* 1) Live <select> inside the rendered map: tracks the dropdown
		      immediately, on first render and after a change. Search the map
		      root directly instead of modeOption.node, which is not reliably
		      populated in every LuCI build. */
		var sels = node.querySelectorAll('select');
		for (var i = 0; i < sels.length; i++) {
			if ((sels[i].id || '').indexOf('mode') !== -1 && sels[i].value)
				return sels[i].value;
		}

		/* 2) Saved UCI value, read exactly like the section filter
		      (sectionUsesEpon) does, so the post-apply state is always right
		      even if the option node is not resolvable. */
		var lines = uci.sections('pon', 'xpon') || [];
		for (var j = 0; j < lines.length; j++) {
			var sid = lines[j].name || lines[j]['.name'] || lines[j].sid;
			var m = uci.get('pon', sid, 'mode');

			if (m)
				return m;
		}

		if (modeOption && modeOption.sid) {
			try {
				var v = modeOption.formvalue(modeOption.sid);

				if (v)
					return v;
			} catch (e) {}
		}

		return null;
	}

	function update() {
		var epon = isEponMode(readMode());

		if (omci)
			omci.classList[epon ? 'add' : 'remove']('hidden');

		if (oam)
			oam.classList[epon ? 'remove' : 'add']('hidden');
	}

	if (modeOption)
		modeOption.onchange = update;

	/* Attach directly to the mode <select> as a backup trigger. */
	var sels = node.querySelectorAll('select');
	for (var k = 0; k < sels.length; k++) {
		if ((sels[k].id || '').indexOf('mode') !== -1) {
			sels[k].addEventListener('change', update);
			sels[k].addEventListener('input', update);
			break;
		}
	}

	update();
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.exec_direct('/usr/libexec/onu-hwinfo'), ''),
			uci.load('pon')
		]).then(function(data) {
			return data[0];
		});
	},

	render: function(hwinfo) {
		var m, s, o, modeOption;

		m = new form.Map('pon', _('Authentication'),
			_('PON line mode and credentials used to register the ONU with the OLT.'));
		m.readonly = !L.hasViewPermission();

		s = m.section(form.TypedSection, 'xpon', _('PON Mode'));
		s.anonymous = true;
		s.addremove = false;
		s.description = _('Line mode and registration identity take effect after the PON interface restarts.');

		/*
		 * The ONU class travels in the carrier ONU capability ME, and the
		 * carriers do not share one: Telecom defines class 0xFFF9 and Unicom
		 * 0xFFB1, each carrying the operator ID, the spec version, the ONU type
		 * and the Tx power control in that order. Which of them a line offers -
		 * and what it reports in it - describes how the line registers with the
		 * operator, so both options sit with the line mode rather than in the
		 * OMCI compatibility tab.
		 */
		o = s.option(form.ListValue, 'carrier', _('Operator profile'));
		o.default = 'auto';
		o.rmempty = false;
		o.value('auto', _('Automatic'));
		o.value('ctc', _('China Telecom'));
		o.value('cuc', _('China Unicom'));
		o.value('cmcc', _('China Mobile'));
		o.description = _('Which carrier capability ME the line offers. Telecom and Unicom both define one; no reference defines a China Mobile one, so that profile keeps the standard MIB.');

		o = s.option(form.ListValue, 'onu_type', _('ONU type'));
		o.default = '1';
		o.rmempty = false;
		o.value('0', _('SFU'));
		o.value('1', _('HGU'));
		o.value('2', _('SBU'));
		o.description = _('ONU class reported to the OLT in the capability ME: 0 SFU, 1 HGU (default), 2 SBU.');

		o = s.option(form.ListValue, 'mode', _('Line mode'));
		o.rmempty = false;

		var cap = calibrationCapabilities(hwinfo);
		var allowed = allowedLineModes(cap);
		var saved = currentLineMode();

		allowed.forEach(function(mode) {
			o.value(mode, lineModeLabel(mode));
		});

		/*
		 * Keep the saved value visible even when the calibration data says
		 * otherwise. The backend still accepts a forced mode; silently
		 * replacing the saved value here could restart a working PON.
		 */
		if (saved && allowed.indexOf(saved) < 0)
			o.value(saved, lineModeLabel(saved) + ' — ' + _('当前配置，校准不支持'));

		o.default = saved || allowed[0] || 'xgpon';

		if (cap.a0 && !cap.a2)
			o.description = _('只有 A0 光校准有效，当前仅提供 10G-EPON 线路模式。');
		else if (!cap.a0 && cap.a2)
			o.description = _('只有 A2 光校准有效，当前仅提供 GPON 系列线路模式。');
		else if (!cap.a0 && !cap.a2)
			o.description = _('未检测到有效的 A0/A2 光校准数据，线路模式不会被限制。');
		else
			o.description = _('A0 和 A2 光校准均有效，可选择全部线路模式。');

		if (saved && allowed.indexOf(saved) < 0)
			o.description += ' ' + _('当前保存的模式不在校准支持范围内，已保留但建议核对。');

		modeOption = o;

	s = m.section(form.TypedSection, 'omci', _('OMCI settings'),
		_('The ONU identity reported over OMCI is configured on the hardware identity page.'));
	s.anonymous = true;
	s.addremove = false;
	s.filter = function(sectionId) {
		return !sectionUsesEpon(sectionId);
	};
	s.tab('authentication', _('Authentication'));
	s.tab('compatibility', _('Compatibility'));

	o = s.taboption('authentication', form.ListValue, 'auth_mode', _('Authentication mode'),
		_('LOID auth: LOID + optional password. Password auth: registration ID only, no LOID.'));
	o.default = 'loid';
	o.rmempty = false;
	/*
	 * The status page uses the same words for the LOID authentication *result*;
	 * the context keeps these two translations apart.
	 */
	o.value('loid', _('LOID authentication', 'PON authentication mode'));
	o.value('password', _('Password authentication', 'PON authentication mode'));

	/*
	 * Visible for LOID authentication and for configurations written before the
	 * mode existed: two depends calls are an OR, so hiding them would strand the
	 * LOID of an installation that never learned the option.
	 */
	o = s.taboption('authentication', form.Value, 'loid', _('LOID'));
	o.rmempty = true;
	o.depends('auth_mode', 'loid');
	o.depends('auth_mode', '');
	o.validate = asciiLength(1, 24);

	o = s.taboption('authentication', form.Value, 'loid_password', _('LOID password'),
		_('Leave empty for pure LOID authentication; set it only when the OLT asks for a password next to the LOID.'));
	o.password = true;
	o.rmempty = true;
	o.depends('auth_mode', 'loid');
	o.depends('auth_mode', '');
	o.validate = asciiLength(1, 12);

	/*
	 * The registration ID is an authentication credential, so it belongs with the
	 * LOID it competes with rather than next to the line's serial number. The
	 * value still stored on the line is shown until it is saved here.
	 */
	o = s.taboption('authentication', form.Value, 'registration_id', _('Registration-ID'));
	o.password = true;
	o.rmempty = true;
	o.depends('auth_mode', 'password');
	o.validate = asciiLength(1, 36);
	o.cfgvalue = function(sectionId) {
		var line = uci.get('pon', sectionId, 'line');

		return uci.get('pon', sectionId, 'registration_id') ||
			uci.get('pon', line, 'registration_id') || '';
	};
	o.description = _('Optional; sent as all zeros when empty.');

	/*
	 * The OMCC version tells the OLT which OMCI baseline the ONU speaks. The
	 * list is ordered oldest to newest so the "when to try something else"
	 * reading follows the dropdown top to bottom; the default stays 0xb0.
	 */
	o = s.taboption('compatibility', form.ListValue, 'omcc_version', _('OMCC version'));
	o.value('0x86', '0x86');
	o.value('0xa0', '0xa0');
	o.value('0xa8', '0xa8');
	o.value('0xb0', '0xb0');
	o.value('0xb4', '0xb4');
	o.default = '0xb0';
	o.rmempty = false;
	o.description = _('0x86: Huawei OLT incompatible with old or third-party ONUs | 0xA0: early GPON baseline | 0xA8: G.984 evolution, common on ZTE and Fiberhome | 0xB0: Huawei new-firmware default | 0xB4: enhanced version for newer Huawei and Nokia OLTs.');

	o = s.taboption('compatibility', form.Flag, 'disable_enhanced_security', _('Disable enhanced security (Class 332)'));
	o.default = '0';
	o.rmempty = true;

	o = s.taboption('compatibility', form.Value, 'alloc_id_timeout', _('Alloc-ID wait timeout'));
		o.datatype = 'uinteger';
		o.placeholder = '30';
		o.rmempty = true;
		o.description = _('Seconds a data path may wait for PLOAM to assign its Alloc-ID before it is reported as failed. The ONU keeps waiting afterwards; 0 disables the timeout.');

	s = m.section(form.TypedSection, 'oam', _('EPON OAM settings'),
		_('The ONU identity reported over OAM is configured on the hardware identity page.'));
	s.anonymous = true;
	s.addremove = false;
	s.filter = function(sectionId) {
		return sectionUsesEpon(sectionId);
	};

	
	o = s.option(form.ListValue, 'operator', _('OAM profile'));
	o.default = 'ctc';
	o.value('ieee', _('IEEE 802.3ah'));
	o.value('ctc', _('IEEE 802.3ah + CTC'));
	o.description = _('Standard: IEEE 802.3ah. China Telecom Enhanced: IEEE 802.3ah + CTC.');


	o = s.option(form.Value, 'loid', _('LOID'));
	o.rmempty = true;
	o.depends('operator', 'ctc');
	o.validate = asciiLength(1, 24);

	o = s.option(form.Value, 'loid_password', _('LOID password'));
	o.password = true;
	o.rmempty = true;
	o.depends('operator', 'ctc');
	o.validate = asciiLength(1, 12);
	o.description = _('Enter the LOID password provided by your ISP. Leave empty if not required.');

		return m.render().then(function(node) {
			toggleModeSections(node, modeOption);

			return node;
		});
	}
});
