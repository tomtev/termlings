import type { Entity } from "./types.js"

export function tileScaleX(zoomLevel: number): number {
  return zoomLevel === 0 ? 2 : 1
}

/** Convert tile x to screen x */
export function tileToScreenX(tx: number, cameraX: number, zoomLevel: number): number {
  return (tx - cameraX) * tileScaleX(zoomLevel)
}

/** Convert screen x to tile x */
export function screenToTileX(sx: number, cameraX: number, zoomLevel: number): number {
  return Math.floor(sx / tileScaleX(zoomLevel)) + cameraX
}

/** Compute camera position centered on a target entity */
export function computeCamera(
  target: Entity,
  cols: number,
  rows: number,
  zoomLevel: number,
): { cameraX: number; cameraY: number } {
  const scale = tileScaleX(zoomLevel)
  const cameraX = target.x + Math.floor(9 / 2) - Math.floor(cols / scale / 2)
  const cameraY = target.y + Math.floor(target.height / 2) - Math.floor(rows / 2)
  return { cameraX, cameraY }
}
