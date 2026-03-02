const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start._nij8ASU.js",app:"_app/immutable/entry/app.B1c0T6BN.js",imports:["_app/immutable/entry/start._nij8ASU.js","_app/immutable/chunks/B4mQZ9mf.js","_app/immutable/chunks/CufHi2q-.js","_app/immutable/chunks/BTCDswmT.js","_app/immutable/entry/app.B1c0T6BN.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/CufHi2q-.js","_app/immutable/chunks/B3FqVsWr.js","_app/immutable/chunks/rLtue24v.js","_app/immutable/chunks/BTCDswmT.js","_app/immutable/chunks/TIaUNzzf.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./chunks/0-Cve_Me4S.js')),
			__memo(() => import('./chunks/1-Bfd50ENt.js')),
			__memo(() => import('./chunks/2-swfWzkts.js')),
			__memo(() => import('./chunks/3-DzNBVnuz.js')),
			__memo(() => import('./chunks/4-BGrrrEb_.js')),
			__memo(() => import('./chunks/5-C5qJK5aF.js')),
			__memo(() => import('./chunks/6-OuizXjih.js')),
			__memo(() => import('./chunks/7-CQJSu0qn.js')),
			__memo(() => import('./chunks/8-CtAMJkbL.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/hub/health",
				pattern: /^\/api\/hub\/health\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-DmW_Tj0q.js'))
			},
			{
				id: "/api/v1/messages",
				pattern: /^\/api\/v1\/messages\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-BGBkckI2.js'))
			},
			{
				id: "/api/v1/projects",
				pattern: /^\/api\/v1\/projects\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-DCs-GjTh.js'))
			},
			{
				id: "/api/v1/sessions",
				pattern: /^\/api\/v1\/sessions\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-BmYCLaOo.js'))
			},
			{
				id: "/api/v1/sessions/leave",
				pattern: /^\/api\/v1\/sessions\/leave\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-bcN-4HAp.js'))
			},
			{
				id: "/api/v1/state",
				pattern: /^\/api\/v1\/state\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-C_TDFWnD.js'))
			},
			{
				id: "/api/workspace",
				pattern: /^\/api\/workspace\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-CVTAY9n2.js'))
			},
			{
				id: "/api/workspace/delta-stream",
				pattern: /^\/api\/workspace\/delta-stream\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-PwSHhh-q.js'))
			},
			{
				id: "/api/workspace/join",
				pattern: /^\/api\/workspace\/join\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-PDzE642i.js'))
			},
			{
				id: "/api/workspace/leave",
				pattern: /^\/api\/workspace\/leave\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-BKYwhQhv.js'))
			},
			{
				id: "/api/workspace/message",
				pattern: /^\/api\/workspace\/message\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-CWlgKfbE.js'))
			},
			{
				id: "/api/workspace/stream",
				pattern: /^\/api\/workspace\/stream\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-CW0fwysA.js'))
			},
			{
				id: "/[project]",
				pattern: /^\/([^/]+?)\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/[project]/agents/[slug]",
				pattern: /^\/([^/]+?)\/agents\/([^/]+?)\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false},{"name":"slug","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/[project]/calendar",
				pattern: /^\/([^/]+?)\/calendar\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/[project]/channel",
				pattern: /^\/([^/]+?)\/channel\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/[project]/channel/[channel]",
				pattern: /^\/([^/]+?)\/channel\/([^/]+?)\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false},{"name":"channel","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/[project]/tasks",
				pattern: /^\/([^/]+?)\/tasks\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 8 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

const prerendered = new Set([]);

const base = "";

export { base, manifest, prerendered };
//# sourceMappingURL=manifest.js.map
