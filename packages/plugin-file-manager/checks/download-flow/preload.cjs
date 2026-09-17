// `@kn/common` is a browser-only barrel (React, i18n, import.meta), so this
// check cannot load the real module in Node. tsc maps the specifier to
// `download-flow.stubs.ts` for types; this preload maps it to a tiny synthetic
// module at runtime. `authorizedFetch` delegates to a global hook so each
// scenario can decide what the API request returns.
const Module = require('module');
const path = require('path');

const stubId = path.join(__dirname, 'download-flow.stubs.js');
const synthetic = new Module(stubId, null);
synthetic.filename = stubId;
synthetic.loaded = true;
synthetic.exports = {
    logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    },
    API_BASE_URL: '/api',
    authorizedFetch: (url, init) => globalThis.__authorizedFetch(url, init),
};
require.cache[stubId] = synthetic;

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === '@kn/common') return stubId;
    return originalResolve.call(this, request, ...args);
};
