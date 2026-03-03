import { i as isAuthorized, a as corsJson, c as corsEmpty } from "../../../../../chunks/public-api.js";
import { l as listHubProjects } from "../../../../../chunks/hub.js";
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
export {
  GET,
  OPTIONS
};
