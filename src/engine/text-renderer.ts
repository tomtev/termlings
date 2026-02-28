/**
 * Convert text to 2D object cells for rendering as signs/labels
 * Supports both small readable text (single-line) and large pixel font
 */

import type { ObjectCell, ObjectDef, RGB } from "./objects.js"

/**
 * Create a simple text nameplate/label
 * Renders readable text directly (one row, normal character size)
 * Perfect for desk nameplates, office signs, etc.
 *
 * Example: "Tommy" becomes [T][o][m][m][y] in one row
 */
export function createSimpleLabel(
  text: string,
  fgColor: RGB = [200, 200, 200],
  bgColor: RGB | null = null,
): (ObjectCell | null)[][] {
  // Single row of text characters
  const textRow: (ObjectCell | null)[] = []

  for (const char of text) {
    textRow.push({
      ch: char,
      fg: fgColor,
      bg: bgColor,
      walkable: true,
    })
  }

  return [textRow]
}

/**
 * Create a bracketed nameplate [Name]
 * Useful for nameplates on desks, doors, etc.
 */
export function createBracketedLabel(
  text: string,
  fgColor: RGB = [200, 200, 200],
  bgColor: RGB | null = null,
): (ObjectCell | null)[][] {
  const bracketColor: RGB = [120, 120, 120]
  const row: (ObjectCell | null)[] = [
    { ch: "[", fg: bracketColor, bg: bgColor, walkable: true },
  ]

  for (const char of text) {
    row.push({
      ch: char,
      fg: fgColor,
      bg: bgColor,
      walkable: true,
    })
  }

  row.push({ ch: "]", fg: bracketColor, bg: bgColor, walkable: true })
  return [row]
}

/**
 * Create a framed label with border
 * Useful for standalone signs
 */
export function createFramedLabel(
  text: string,
  fgColor: RGB = [200, 200, 200],
  bgColor: RGB | null = null,
): (ObjectCell | null)[][] {
  const borderColor: RGB = [120, 120, 120]
  const result: (ObjectCell | null)[][] = []

  // Top border
  const topRow: ObjectCell[] = [{ ch: "┌", fg: borderColor, bg: null, walkable: true }]
  for (let i = 0; i < text.length; i++) {
    topRow.push({ ch: "─", fg: borderColor, bg: null, walkable: true })
  }
  topRow.push({ ch: "┐", fg: borderColor, bg: null, walkable: true })
  result.push(topRow)

  // Text row with side borders
  const textRow: (ObjectCell | null)[] = [{ ch: "│", fg: borderColor, bg: null, walkable: true }]
  for (const char of text) {
    textRow.push({
      ch: char,
      fg: fgColor,
      bg: bgColor,
      walkable: true,
    })
  }
  textRow.push({ ch: "│", fg: borderColor, bg: null, walkable: true })
  result.push(textRow)

  // Bottom border
  const bottomRow: ObjectCell[] = [{ ch: "└", fg: borderColor, bg: null, walkable: true }]
  for (let i = 0; i < text.length; i++) {
    bottomRow.push({ ch: "─", fg: borderColor, bg: null, walkable: true })
  }
  bottomRow.push({ ch: "┘", fg: borderColor, bg: null, walkable: true })
  result.push(bottomRow)

  return result
}

/**
 * Generate a complete ObjectDef (JSON-serializable) for a bracketed nameplate
 * Ready to save as `.termlings/objects/nameplate-<name>.json`
 */
export function generateNameplateObjectDef(
  name: string,
  fgColor: RGB = [200, 150, 100],
): ObjectDef {
  const cells = createBracketedLabel(name, fgColor)
  return {
    name: `nameplate-${name.toLowerCase()}`,
    width: cells[0]?.length ?? 1,
    height: cells.length,
    cells: cells as (ObjectCell | null)[][],
  }
}

/**
 * Generate a complete ObjectDef (JSON-serializable) for a framed sign
 * Ready to save as `.termlings/objects/sign-<name>.json`
 */
export function generateSignObjectDef(
  text: string,
  fgColor: RGB = [100, 200, 100],
): ObjectDef {
  const cells = createFramedLabel(text, fgColor)
  return {
    name: `sign-${text.toLowerCase().replace(/\s+/g, "-")}`,
    width: cells[0]?.length ?? 1,
    height: cells.length,
    cells: cells as (ObjectCell | null)[][],
  }
}
