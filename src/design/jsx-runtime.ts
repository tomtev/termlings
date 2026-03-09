import { DESIGN_ELEMENT, Fragment } from "./index.js"

function createElement(type: unknown, props: Record<string, unknown> | null | undefined, key?: string): {
  $$typeof: symbol
  type: unknown
  props: Record<string, unknown>
  key: string | number | null
} {
  return {
    $$typeof: DESIGN_ELEMENT,
    type,
    props: props || {},
    key: key ?? null,
  }
}

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: string) {
  return createElement(type, props, key)
}

export const jsxs = jsx
export { Fragment }
