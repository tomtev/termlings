import { json } from '@sveltejs/kit';
import { l as loadWorkspaceSnapshot } from './workspace-BILcvbix.js';
import { r as resolveProjectContext } from './hub-BHhrJYhI.js';
import 'fs';
import 'path';
import 'crypto';
import 'os';

const GET = ({ url }) => {
  const requestedProject = url.searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(requestedProject);
  return json({
    snapshot: loadWorkspaceSnapshot(context.projectRoot),
    projects: context.projects,
    activeProjectId: context.activeProjectId
  });
};

export { GET };
//# sourceMappingURL=_server.ts-DJTLl6DP.js.map
