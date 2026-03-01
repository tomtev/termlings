import type { PageServerLoad } from "./$types"
import { resolveProjectContext } from "$lib/server/hub"
import { redirect } from "@sveltejs/kit"

export const load: PageServerLoad = async () => {
  const context = resolveProjectContext(undefined)
  throw redirect(307, `/${encodeURIComponent(context.activeProjectId)}`)
}
