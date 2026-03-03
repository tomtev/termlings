/**
 * Fun random name generator for agents
 * Generates creative one-word names like "Sprout", "Nimbus", "Quill", etc.
 */

const FUN_ONE_WORD_NAMES = [
  "Pixel", "Sprout", "Ember", "Nimbus", "Glitch", "Ziggy", "Quill", "Cosmo", "Maple", "Flint",
  "Wren", "Dusk", "Byte", "Fern", "Spark", "Nova", "Haze", "Basil", "Reef", "Orbit",
  "Sage", "Rusty", "Coral", "Luna", "Cinder", "Pip", "Storm", "Ivy", "Blaze", "Mochi",
  "Comet", "Echo", "Misty", "Sable", "Rogue", "Fable", "Kite", "Juno", "Indie", "Koda",
  "Skye", "Drift", "Frost", "Vivid", "Prism", "Scout", "Tango", "Lumen", "Rivet", "Pebble",
  "Tofu", "Nori", "Pesto", "Noodle", "Pickle", "Mango", "Aster", "Petal", "Clover", "Thyme",
  "Breeze", "Ripple", "Marble", "Velvet", "Flicker", "Rocket", "Cricket", "Whisper", "Jasper", "Onyx",
] as const;

function randomFrom<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

/**
 * Generate a fun random agent name
 */
export function generateFunName(): string {
  return randomFrom(FUN_ONE_WORD_NAMES);
}

/**
 * Generate multiple unique one-word fun names.
 */
export function generateFunNames(count: number): string[] {
  if (count <= 0) return [];

  const names = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 20;

  while (names.size < count && attempts < maxAttempts) {
    names.add(generateFunName());
    attempts++;
  }

  const list = Array.from(names);
  let suffix = 2;
  while (list.length < count) {
    list.push(`${generateFunName()}${suffix}`);
    suffix++;
  }

  return list.slice(0, count);
}
