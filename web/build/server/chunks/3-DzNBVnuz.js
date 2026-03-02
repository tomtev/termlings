import { l as loadWorkspaceRouteData } from './workspace-route-BGbYhHUq.js';
import '@sveltejs/kit';
import './workspace-CMuDx67t.js';
import 'fs';
import 'path';
import './hub-BHhrJYhI.js';
import 'crypto';
import 'os';

const load = async ({ params, url }) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: "activity",
    pathname: url.pathname
  });
};

var _page_server_ts = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 3;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-WtsvVtaH.js')).default;
const server_id = "src/routes/[project]/+page.server.ts";
const imports = ["_app/immutable/nodes/3.CENGzEKM.js","_app/immutable/chunks/rLtue24v.js","_app/immutable/chunks/CufHi2q-.js","_app/immutable/chunks/AqJ9PqC-.js","_app/immutable/chunks/BEpYMypV.js","_app/immutable/chunks/TIaUNzzf.js","_app/immutable/chunks/BTCDswmT.js","_app/immutable/chunks/B3FqVsWr.js","_app/immutable/chunks/D66qLDx8.js","_app/immutable/chunks/B4mQZ9mf.js"];
const stylesheets = ["_app/immutable/assets/WorkspaceView.M9zxpHNa.css"];
const fonts = [];

export { component, fonts, imports, index, _page_server_ts as server, server_id, stylesheets };
//# sourceMappingURL=3-DzNBVnuz.js.map
