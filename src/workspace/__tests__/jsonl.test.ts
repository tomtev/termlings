import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { readLastJsonLines } from "../jsonl.js"

describe("jsonl tail reads", () => {
  let root = ""

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-jsonl-test-"))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("returns the most recent records across chunk boundaries", () => {
    const file = join(root, "history.jsonl")
    const lines: string[] = []

    for (let index = 0; index < 150; index += 1) {
      lines.push(JSON.stringify({
        id: index,
        payload: "x".repeat(1200),
      }))
    }

    writeFileSync(file, `${lines.join("\n")}\n`, "utf8")

    const parsed = readLastJsonLines<{ id: number }>(file, 5)
    expect(parsed.map((entry) => entry.id)).toEqual([145, 146, 147, 148, 149])
  })
})
