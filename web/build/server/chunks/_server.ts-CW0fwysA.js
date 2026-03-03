import { l as loadWorkspaceSnapshot } from './workspace-CMuDx67t.js';
import { r as resolveProjectContext } from './hub-BHhrJYhI.js';
import { s as subscribeHubChanges, a as subscribeProjectChanges, b as subscribeMessageChanges } from './message-watcher--1l1AYRH.js';
import 'fs';
import 'path';
import 'crypto';
import 'os';

const GET = ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? void 0;
  const encoder = new TextEncoder();
  let heartbeat = null;
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let watchedProjectRoot = "";
      let unsubscribeProject = null;
      let unsubscribeHub = null;
      let unsubscribeMessages = null;
      let sendScheduled = false;
      const scheduleSend = () => {
        if (closed || sendScheduled) return;
        sendScheduled = true;
        queueMicrotask(() => {
          sendScheduled = false;
          sendUpdate();
        });
      };
      const sendUpdate = () => {
        if (closed) return;
        const context = resolveProjectContext(requestedProject);
        if (context.projectRoot !== watchedProjectRoot) {
          watchedProjectRoot = context.projectRoot;
          if (unsubscribeProject) unsubscribeProject();
          if (unsubscribeMessages) unsubscribeMessages();
          unsubscribeProject = subscribeProjectChanges(context.projectRoot, scheduleSend);
          unsubscribeMessages = subscribeMessageChanges(context.projectRoot, scheduleSend);
        }
        const snapshot = loadWorkspaceSnapshot(context.projectRoot);
        const payload = {
          snapshot,
          projects: context.projects,
          activeProjectId: context.activeProjectId
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));
      };
      unsubscribeHub = subscribeHubChanges(scheduleSend);
      sendUpdate();
      heartbeat = setInterval(sendUpdate, 2e3);
      const onAbort = () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribeProject) unsubscribeProject();
        if (unsubscribeHub) unsubscribeHub();
        if (unsubscribeMessages) unsubscribeMessages();
        try {
          controller.close();
        } catch {
        }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    }
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream"
    }
  });
};

export { GET };
//# sourceMappingURL=_server.ts-CW0fwysA.js.map
