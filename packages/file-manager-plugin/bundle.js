(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@repo/common')) :
	typeof define === 'function' && define.amd ? define(['exports', '@repo/common'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.TestPlugin = {}, global["@repo/common"]));
})(this, (function (exports, common) { 'use strict';

	class TestPlugin extends common.KPlugin {
	}

	exports.TestPlugin = TestPlugin;

}));
