import * as server from '../entries/pages/_project_/tasks/_page.server.ts.js';

export const index = 8;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_project_/tasks/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/[project]/tasks/+page.server.ts";
export const imports = ["_app/immutable/nodes/8.D6sJ2h61.js","_app/immutable/chunks/rLtue24v.js","_app/immutable/chunks/CufHi2q-.js","_app/immutable/chunks/AqJ9PqC-.js","_app/immutable/chunks/ncxVyEd8.js","_app/immutable/chunks/TIaUNzzf.js","_app/immutable/chunks/BTCDswmT.js","_app/immutable/chunks/B3FqVsWr.js","_app/immutable/chunks/D66qLDx8.js","_app/immutable/chunks/D03MXp9C.js"];
export const stylesheets = ["_app/immutable/assets/WorkspaceView.M9zxpHNa.css"];
export const fonts = [];
