import { redirect } from '@sveltejs/kit';
import { l as loadWorkspaceSnapshot } from './workspace-CMuDx67t.js';
import { r as resolveProjectContext } from './hub-BHhrJYhI.js';

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}
function isValidDna(value) {
  return /^[0-9a-f]{7}$/i.test(value);
}
function threadPath(projectId, threadId) {
  const encodedProjectId = encodeURIComponent(projectId);
  if (threadId === "activity") return `/${encodedProjectId}`;
  if (threadId === "workspace" || threadId === "inbox") {
    return `/${encodedProjectId}/channel/${encodeURIComponent(threadId)}`;
  }
  if (threadId === "tasks") return `/${encodedProjectId}/tasks`;
  if (threadId === "calendar") return `/${encodedProjectId}/calendar`;
  const dna = threadId.slice("agent:".length);
  return `/${encodedProjectId}/agents/${encodeURIComponent(dna)}`;
}
function normalizeThreadId(threadId) {
  if (threadId.startsWith("agent:")) {
    const dna = threadId.slice("agent:".length);
    if (!isValidDna(dna)) return "activity";
    return `agent:${dna.toLowerCase()}`;
  }
  return threadId;
}
function loadWorkspaceRouteData(input) {
  const context = resolveProjectContext(input.requestedProjectId);
  const activeThreadId = normalizeThreadId(input.requestedThreadId);
  const canonicalPath = threadPath(context.activeProjectId, activeThreadId);
  if (normalizePath(input.pathname) !== normalizePath(canonicalPath)) {
    throw redirect(307, canonicalPath);
  }
  return {
    payload: {
      snapshot: loadWorkspaceSnapshot(context.projectRoot),
      projects: context.projects,
      activeProjectId: context.activeProjectId
    },
    activeThreadId
  };
}

export { loadWorkspaceRouteData as l };
//# sourceMappingURL=workspace-route-BGbYhHUq.js.map
