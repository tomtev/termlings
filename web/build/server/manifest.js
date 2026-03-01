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
		client: {start:"_app/immutable/entry/start.Ctk0IACU.js",app:"_app/immutable/entry/app.CrUc_reR.js",imports:["_app/immutable/entry/start.Ctk0IACU.js","_app/immutable/chunks/D03MXp9C.js","_app/immutable/chunks/CufHi2q-.js","_app/immutable/chunks/BTCDswmT.js","_app/immutable/entry/app.CrUc_reR.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/CufHi2q-.js","_app/immutable/chunks/B3FqVsWr.js","_app/immutable/chunks/rLtue24v.js","_app/immutable/chunks/BTCDswmT.js","_app/immutable/chunks/TIaUNzzf.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./chunks/0-Cve_Me4S.js')),
			__memo(() => import('./chunks/1-BXs3fxya.js')),
			__memo(() => import('./chunks/2-swfWzkts.js')),
			__memo(() => import('./chunks/3-BLp_eRx7.js')),
			__memo(() => import('./chunks/4-awMVEwGn.js')),
			__memo(() => import('./chunks/5-B6aBWqF0.js')),
			__memo(() => import('./chunks/6-CzZM4cmk.js')),
			__memo(() => import('./chunks/7-W9OLF_7e.js')),
			__memo(() => import('./chunks/8-B_YpaYfj.js'))
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
				endpoint: __memo(() => import('./chunks/_server.ts-DhCmO6Kf.js'))
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
				endpoint: __memo(() => import('./chunks/_server.ts-CP8Mx9_l.js'))
			},
			{
				id: "/api/v1/sessions/leave",
				pattern: /^\/api\/v1\/sessions\/leave\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-C7dr_3_K.js'))
			},
			{
				id: "/api/v1/state",
				pattern: /^\/api\/v1\/state\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-BQMSH0lp.js'))
			},
			{
				id: "/api/workspace",
				pattern: /^\/api\/workspace\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-DJTLl6DP.js'))
			},
			{
				id: "/api/workspace/delta-stream",
				pattern: /^\/api\/workspace\/delta-stream\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-BG7047W8.js'))
			},
			{
				id: "/api/workspace/join",
				pattern: /^\/api\/workspace\/join\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-OgE-RyjU.js'))
			},
			{
				id: "/api/workspace/leave",
				pattern: /^\/api\/workspace\/leave\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-U3OTdrn4.js'))
			},
			{
				id: "/api/workspace/message",
				pattern: /^\/api\/workspace\/message\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-DsD1azr1.js'))
			},
			{
				id: "/api/workspace/stream",
				pattern: /^\/api\/workspace\/stream\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-BbqkChMR.js'))
			},
			{
				id: "/[project]",
				pattern: /^\/([^/]+?)\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/[project]/agents/[dna]",
				pattern: /^\/([^/]+?)\/agents\/([^/]+?)\/?$/,
				params: [{"name":"project","optional":false,"rest":false,"chained":false},{"name":"dna","optional":false,"rest":false,"chained":false}],
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
