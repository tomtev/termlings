import { i as isAuthorized, a as corsJson, c as corsEmpty } from './public-api-zplf20gd.js';
import { l as listHubProjects } from './hub-BHhrJYhI.js';
import '@sveltejs/kit';
import 'fs';
import 'path';
import 'crypto';
import 'os';

const OPTIONS = async () => {
  return corsEmpty();
};
const GET = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 });
  }
  return corsJson({
    apiVersion: "v1",
    projects: listHubProjects()
  });
};

export { GET, OPTIONS };
//# sourceMappingURL=_server.ts-DCs-GjTh.js.map
