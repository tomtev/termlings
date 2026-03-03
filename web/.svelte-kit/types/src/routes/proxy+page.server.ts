// @ts-nocheck
import type { PageServerLoad } from "./$types"
import { resolveProjectContext } from "$lib/server/hub"
import { redirect } from "@sveltejs/kit"

export const load = async () => {
  const context = resolveProjectContext(undefined)
  throw redirect(307, `/${encodeURIComponent(context.activeProjectId)}`)
}
;null as any as PageServerLoad;