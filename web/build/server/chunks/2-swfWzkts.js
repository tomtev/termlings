import { r as resolveProjectContext } from './hub-BHhrJYhI.js';
import { redirect } from '@sveltejs/kit';
import 'fs';
import 'path';
import 'crypto';
import 'os';

const load = async () => {
  const context = resolveProjectContext(void 0);
  throw redirect(307, `/${encodeURIComponent(context.activeProjectId)}`);
};

var _page_server_ts = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 2;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-EDHUjP4n.js')).default;
const server_id = "src/routes/+page.server.ts";
const imports = ["_app/immutable/nodes/2.CLFeP6gE.js","_app/immutable/chunks/rLtue24v.js","_app/immutable/chunks/CufHi2q-.js","_app/immutable/chunks/AqJ9PqC-.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, _page_server_ts as server, server_id, stylesheets };
//# sourceMappingURL=2-swfWzkts.js.map
