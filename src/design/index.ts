export const Screen = "screen"
export const Frame = "frame"
export const Text = "text"
export const Image = "image"
export const Instance = "instance"
export const Fragment = Symbol.for("termlings.design.fragment")
export const DESIGN_ELEMENT = Symbol.for("termlings.design.element")

export type DesignIntrinsicType =
  | typeof Screen
  | typeof Frame
  | typeof Text
  | typeof Image
  | typeof Instance

export type DesignNodeType = Exclude<DesignIntrinsicType, typeof Instance>

export type DesignElementType = DesignIntrinsicType | typeof Fragment | ((props: Record<string, unknown>) => unknown)

export interface FitTextDefinition {
  mode: "none" | "height" | "truncate" | "shrink"
  min?: number
  max?: number
  maxLines?: number
  step?: number
  fallback?: "truncate" | "clip"
  ellipsis?: boolean
}

export interface DesignPropDefinition {
  type: "string" | "image" | "boolean" | "enum" | "color"
  default?: unknown
  options?: string[]
}

export type DesignPropsDefinition = Record<string, DesignPropDefinition>

export interface DesignMeta {
  id: string
  title?: string
  intent?: string
  size: {
    width: number
    height: number
  }
  audience?: string
}

export interface DesignElementShape {
  $$typeof: symbol
  type: DesignElementType
  props: Record<string, unknown>
  key: string | number | null
}

export function isDesignElement(value: unknown): value is DesignElementShape {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { $$typeof?: unknown }).$$typeof === DESIGN_ELEMENT,
  )
}
