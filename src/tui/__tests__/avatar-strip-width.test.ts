import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { WorkspaceTui } from "../tui.js"
import type { AvatarBlock } from "../types.js"

describe("workspace tui avatar strip widths", () => {
  let root = ""

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
      root = ""
    }
  })

  it("uses a fixed small-avatar slot width regardless of label length", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-avatar-width-"))
    const tui = new WorkspaceTui(root) as any
    tui.avatarSizeMode = "small"

    const blocks: AvatarBlock[] = [
      {
        kind: "activity",
        label: "All",
        displayLabel: "All",
        subtitle: "Activity",
        lines: ["12345678901"],
        width: 11,
        selected: false,
      },
      {
        kind: "agent",
        label: "Scout",
        displayLabel: "Scout",
        subtitle: "RA",
        lines: ["123456789"],
        width: 9,
        selected: true,
      },
      {
        kind: "agent",
        label: "Backend Developer With A Very Long Name",
        displayLabel: "Backend Developer With A Very Long Name",
        subtitle: "Backend Developer With An Even Longer Title",
        lines: ["123456789"],
        width: 9,
        selected: false,
      },
    ]

    const slotWidth = tui.avatarSlotWidthForBlocks(blocks)
    const normalized = blocks.map((block) => ({ ...block, width: slotWidth }))

    expect(slotWidth).toBe(11)
    expect(new Set(normalized.map((block) => block.width))).toEqual(new Set([11]))
  })

  it("keeps tiny-avatar slots readable instead of collapsing to glyph width", () => {
    root = mkdtempSync(join(tmpdir(), "termlings-tui-avatar-width-"))
    const tui = new WorkspaceTui(root) as any
    tui.avatarSizeMode = "tiny"

    const blocks: AvatarBlock[] = [
      {
        kind: "activity",
        label: "All",
        displayLabel: "All",
        subtitle: "Activity",
        lines: ["▤"],
        width: 1,
        selected: false,
      },
      {
        kind: "agent",
        label: "Whisper",
        displayLabel: "Whisper",
        subtitle: "PM",
        lines: ["■"],
        width: 1,
        selected: true,
      },
    ]

    expect(tui.avatarSlotWidthForBlocks(blocks)).toBe(8)
  })
})
