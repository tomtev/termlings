import type { RequestHandler } from "@sveltejs/kit"
import { corsEmpty, corsJson, isAuthorized } from "$lib/server/public-api"
import { listHubProjects } from "$lib/server/hub"

export const OPTIONS: RequestHandler = async () => {
  return corsEmpty()
}

export const GET: RequestHandler = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 })
  }

  return corsJson({
    apiVersion: "v1",
    projects: listHubProjects(),
  })
}
