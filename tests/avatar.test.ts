import { describe, it, expect } from "bun:test";
import { decodeDNA, encodeDNA, generateRandomDNA, traitsFromName } from "../src/index.js";

describe("Avatar Generation", () => {
  it("should encode and decode DNA consistently", () => {
    const traits = {
      eyes: 0,
      mouth: 0,
      hat: 0,
      body: 0,
      legs: 0,
      faceHue: 0,
      hatHue: 0,
    };
    const dna = encodeDNA(traits);
    const decoded = decodeDNA(dna);
    expect(decoded.eyes).toBe(traits.eyes);
    expect(decoded.mouth).toBe(traits.mouth);
    expect(decoded.hat).toBe(traits.hat);
  });

  it("should generate valid random DNA (7 hex chars)", () => {
    const dna = generateRandomDNA();
    expect(dna).toMatch(/^[0-9a-f]{7}$/);
  });

  it("should generate the same traits from the same name", () => {
    const name1 = traitsFromName("Alice");
    const name2 = traitsFromName("Alice");
    expect(name1.eyes).toBe(name2.eyes);
    expect(name1.mouth).toBe(name2.mouth);
    expect(name1.hat).toBe(name2.hat);
  });

  it("should generate different traits for different names", () => {
    const alice = traitsFromName("Alice");
    const bob = traitsFromName("Bob");
    // At least one trait should differ
    const differs =
      alice.eyes !== bob.eyes ||
      alice.mouth !== bob.mouth ||
      alice.hat !== bob.hat ||
      alice.body !== bob.body ||
      alice.legs !== bob.legs;
    expect(differs).toBe(true);
  });

  it("should handle empty name gracefully", () => {
    const traits = traitsFromName("");
    expect(traits).toHaveProperty("eyes");
    expect(traits).toHaveProperty("mouth");
    expect(traits).toHaveProperty("hat");
  });
});
