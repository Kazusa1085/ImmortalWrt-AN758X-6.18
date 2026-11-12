'use strict';
// shellbox/vendor.js —— 按需加载 vendored 的 xterm.js / addon-fit（含 CSS）
//
// 为什么不用 require('shellbox/xterm')：xterm.js 是 UMD 包，走 LuCI 的 AMD loader
// 行为不明确；这里显式插 <link>/<script> 并等 onload，只加载一次、结果缓存。
//
// LuCI 的模块约定：工厂必须返回 L.Class（loader 会自己 new 出单例），
// 所以这里导出的是「带 load() 方法的类」，视图用 vendor.load()。

function loadStyle(href) {
	return new Promise(function(resolve) {
		var link = document.createElement('link');

		link.rel = 'stylesheet';
		link.href = href;
		link.addEventListener('load', resolve);
		link.addEventListener('error', resolve);   /* 样式失败也继续，终端还能用 */
		document.head.appendChild(link);
	});
}

function loadScript(src) {
	return new Promise(function(resolve, reject) {
		var script = document.createElement('script');

		script.src = src;
		script.async = false;
		script.addEventListener('load', resolve);
		script.addEventListener('error', function() {
			reject(new Error('failed to load ' + src));
		});
		document.head.appendChild(script);
	});
}

/* LuCI 的模块约定：工厂必须返回 L.Class，loader 会自己 new 一个单例给调用方用
 * （所以这里导出的是「带 load() 方法的类」，视图用 vendor.load()）。 */

return L.Class.extend({
	__name__: 'ShellboxVendor',

	_promise: null,

	/* 只加载一次，结果缓存 */
	load: function() {
		if (this._promise)
			return this._promise;

		this._promise = Promise.all([
			loadStyle(L.resource('shellbox/shellbox.css')),
			loadStyle(L.resource('shellbox/xterm.css')),
			loadScript(L.resource('shellbox/xterm.js')),
			loadScript(L.resource('shellbox/addon-fit.js'))
		]).then(function() {
			if (!window.Terminal)
				throw new Error('xterm.js did not register window.Terminal');

			return {
				Terminal: window.Terminal,
				FitAddon: window.FitAddon ? window.FitAddon.FitAddon : null
			};
		});

		return this._promise;
	}
});
