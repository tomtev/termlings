/**
 * Fun random name generator for agents
 * Generates creative, memorable names like "Pixel Storm", "Echo Knight", etc.
 */

const adjectives = [
  // Colors & visual
  "Pixel", "Crystal", "Neon", "Sonic", "Lunar", "Solar", "Stellar",
  "Aurora", "Prism", "Radiant", "Shimmer", "Glimmer", "Spark", "Ember",
  // Nature
  "Rusty", "Misty", "Frosty", "Stormy", "Crisp", "Swift", "Nimble",
  // Tech
  "Binary", "Quantum", "Cyber", "Flux", "Volt", "Byte", "Bit",
  // Personality
  "Quirky", "Brilliant", "Witty", "Bold", "Keen", "Zesty", "Vivid",
  // More creative
  "Bouncing", "Floating", "Dancing", "Dashing", "Blazing", "Glowing", "Whirling",
  "Silent", "Curious", "Clever", "Snappy", "Quick", "Rapid", "Swift",
  "Cosmic", "Mystic", "Arcane", "Elegant", "Graceful", "Smooth",
];

const nouns = [
  // Tech
  "Phoenix", "Navigator", "Explorer", "Compass", "Beacon", "Sentinel",
  "Algorithm", "Matrix", "Protocol", "Signal", "Catalyst", "Engine",
  // Nature
  "Storm", "Breeze", "Thunder", "Lightning", "Comet", "Nebula",
  "Forest", "Mountain", "River", "Ocean", "Sky", "Horizon",
  // Concepts
  "Knight", "Sage", "Oracle", "Muse", "Echo", "Pulse", "Rhythm",
  "Vision", "Spirit", "Soul", "Heart", "Mind", "Dream", "Flame",
  // Objects
  "Compass", "Crystal", "Mirror", "Prism", "Gem", "Star", "Wave",
  "Current", "Breaker", "Shadow", "Light", "Shade", "Aura", "Glow",
];

/**
 * Generate a fun random agent name
 */
export function generateFunName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]!;
  const noun = nouns[Math.floor(Math.random() * nouns.length)]!;
  return `${adj} ${noun}`;
}

/**
 * Generate multiple unique fun names
 */
export function generateFunNames(count: number): string[] {
  const names = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10; // Prevent infinite loop

  while (names.size < count && attempts < maxAttempts) {
    names.add(generateFunName());
    attempts++;
  }

  return Array.from(names).slice(0, count);
}
