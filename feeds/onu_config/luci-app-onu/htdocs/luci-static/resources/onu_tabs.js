'use strict';
'require baseclass';

return baseclass.extend({
	render: function(tabs, active) {
		return E('ul', { 'class': 'cbi-tabmenu' }, tabs.map(function(tab) {
			return E('li', {
				'class': 'cbi-tab' + (tab.id === active ? ' cbi-tab-active' : '')
			}, E('a', { href: L.url(tab.path) }, _(tab.title)));
		}));
	}
});
