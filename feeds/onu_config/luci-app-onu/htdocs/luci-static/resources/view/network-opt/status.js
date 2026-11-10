// SPDX-License-Identifier: Apache-2.0

'use strict';
'require fs';
'require view';

return view.extend({
	load: function() {
		return L.resolveDefault(fs.exec_direct('/usr/libexec/network-opt-status'), '');
	},

	render: function(status) {
		return E('div', {}, [
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('运行状态')),
				E('div', { 'class': 'cbi-section-node' }, E('pre', {
					'style': 'white-space: pre-wrap; overflow-x: auto'
				}, status || ''))
			])
		]);
	}
});
