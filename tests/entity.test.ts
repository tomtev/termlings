import { describe, it, expect } from "bun:test";
import { generateRandomDNA } from "../src/index.js";
import { makeEntity } from "../src/engine/entity.js";

describe("Entity Management", () => {
  it("should create an entity with valid properties", () => {
    const dna = generateRandomDNA();
    const entity = makeEntity(dna, 10, 20, 2);

    expect(entity.dna).toBe(dna);
    expect(entity.x).toBe(10);
    expect(entity.y).toBe(20);
    // Height varies based on hat selection (4-16 range)
    expect(entity.height).toBeGreaterThan(0);
    expect(entity.height).toBeLessThan(20);
    expect(entity.traits).toBeTruthy();
  });

  it("should create entity with animation states", () => {
    const dna = generateRandomDNA();
    const entity = makeEntity(dna, 0, 0, 1, {
      walking: true,
      idle: false,
    });

    expect(entity.walking).toBe(true);
    expect(entity.idle).toBe(false);
  });

  it("should create multiple entities with different DNA", () => {
    const dna1 = generateRandomDNA();
    const dna2 = generateRandomDNA();

    const entity1 = makeEntity(dna1, 0, 0, 1);
    const entity2 = makeEntity(dna2, 10, 10, 1);

    expect(entity1.dna).toBe(dna1);
    expect(entity2.dna).toBe(dna2);
    expect(entity1.dna).not.toBe(entity2.dna);
  });

  it("should track entity movement", () => {
    const dna = generateRandomDNA();
    const entity = makeEntity(dna, 0, 0, 1);

    const originalX = entity.x;
    const originalY = entity.y;

    entity.x = 50;
    entity.y = 30;

    expect(entity.x).toBe(50);
    expect(entity.y).toBe(30);
    expect(entity.x).not.toBe(originalX);
    expect(entity.y).not.toBe(originalY);
  });

  it("should support custom entity names", () => {
    const dna = generateRandomDNA();
    const entity = makeEntity(dna, 0, 0, 1);

    entity.name = "Alice";
    expect(entity.name).toBe("Alice");
  });

  it("should have RGB color properties", () => {
    const dna = generateRandomDNA();
    const entity = makeEntity(dna, 0, 0, 1);

    expect(Array.isArray(entity.faceRgb)).toBe(true);
    expect(entity.faceRgb.length).toBe(3);
    expect(Array.isArray(entity.darkRgb)).toBe(true);
    expect(entity.darkRgb.length).toBe(3);
    expect(Array.isArray(entity.hatRgb)).toBe(true);
    expect(entity.hatRgb.length).toBe(3);
  });
});
