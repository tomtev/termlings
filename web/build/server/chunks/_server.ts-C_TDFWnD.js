import { l as loadWorkspaceSnapshot } from './workspace-CMuDx67t.js';
import { i as isAuthorized, a as corsJson, c as corsEmpty } from './public-api-zplf20gd.js';
import { r as resolveProjectContext } from './hub-BHhrJYhI.js';
import 'fs';
import 'path';
import '@sveltejs/kit';
import 'crypto';
import 'os';

const OPTIONS = async () => {
  return corsEmpty();
};
const GET = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedProject = new URL(request.url).searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(requestedProject);
  return corsJson({
    apiVersion: "v1",
    project: {
      projectId: context.activeProjectId,
      projectName: context.projects.find((p) => p.projectId === context.activeProjectId)?.projectName
    },
    ...loadWorkspaceSnapshot(context.projectRoot)
  });
};

export { GET, OPTIONS };
//# sourceMappingURL=_server.ts-C_TDFWnD.js.map
