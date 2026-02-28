import type { RGB } from "./types.js"

/** Get the display character for a tile type */
export function getTileChar(tile: string): string {
  const charMap: Record<string, string> = {
    " ": " ",
    ".": "·",
    ",": "·",
    "#": "█",
    "B": "█", // building
    "W": "█", // wall
    "G": "█", // gate
    "~": "≈", // water (or could use "~" for ASCII)
    "D": "╳", // door
    "e": "·", // egg (item)
    "p": "·", // plant (item)
    "n": "·", // nest (item)
    "h": "·", // house (item)
    "*": "·", // flower (item)
    "f": "·", // fruit (item)
    "c": "·", // carrot (item)
    "r": "·", // rock (item)
    "v": "·", // vine (item)
    "o": "·", // orb (item)
    "w": "·", // wheat (item)
    "P": "·", // path variant
    "S": "·", // stone path
  }
  return charMap[tile] ?? "?"
}

/** Get the RGB color for a tile type */
export function getTileColor(tile: string): RGB | null {
  const colorMap: Record<string, RGB | null> = {
    " ": null,
    ".": [100, 180, 80], // grass - green
    ",": [120, 190, 100], // grass variant - lighter green
    "#": [120, 100, 80], // wall - brown/gray
    "B": [120, 100, 80], // building - brown/gray
    "W": [120, 100, 80], // wall - brown/gray
    "G": [140, 120, 100], // gate - tan
    "~": [100, 150, 200], // water - blue
    "D": [150, 120, 80], // door - tan/brown
    "e": [200, 100, 100], // egg - reddish
    "p": [100, 180, 100], // plant - light green
    "n": [160, 120, 80], // nest - brown
    "h": [180, 140, 100], // house - tan
    "*": [220, 180, 80], // flower - yellow
    "f": [200, 100, 80], // fruit - orange/red
    "c": [200, 140, 80], // carrot - orange
    "r": [100, 100, 100], // rock - gray
    "v": [80, 150, 80], // vine - green
    "o": [200, 150, 100], // orb - tan/gold
    "w": [180, 160, 80], // wheat - tan/gold
    "P": [130, 180, 100], // path variant - green-gray
    "S": [110, 110, 110], // stone path - gray
  }
  return colorMap[tile] ?? null
}
