import { r as resolveProjectContext } from "../../chunks/hub.js";
import { redirect } from "@sveltejs/kit";
const load = async () => {
  const context = resolveProjectContext(void 0);
  throw redirect(307, `/${encodeURIComponent(context.activeProjectId)}`);
};
export {
  load
};
