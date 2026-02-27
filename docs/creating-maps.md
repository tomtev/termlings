# Creating Custom Maps

Maps in Termlings are stored as **JSON files** with a complete world definition. The system uses an old fallback to `map.txt`, but **`map.json` is the modern, unified format**.

## Map Structure

A custom map is a directory with a single file:

```
my-map/
  map.json    ← Complete map definition (tiles, grid, objects, doors, spawns)
```

## map.json Format

Here's the complete structure:

```json
{
  "name": "My Custom World",
  "version": 1,
  "tiles": {
    ".": { "ch": "·", "fg": [100, 100, 100], "walkable": true },
    "#": { "ch": "█", "fg": [80, 80, 80], "fg": null, "walkable": false },
    ",": { "ch": ",", "fg": [60, 120, 50], "walkable": true },
    "~": { "ch": "~", "fg": [100, 150, 220], "walkable": false }
  },
  "grid": [
    "###############",
    "#.....~~~~~....#",
    "#.....~~~~~....#",
    "#..............#",
    "###############"
  ],
  "objects": {},
  "placements": [
    { "object": "sofa", "x": 2, "y": 2 },
    { "object": "tree", "x": 8, "y": 2 }
  ],
  "doors": [
    { "x": 5, "y": 4, "orientation": "horizontal", "length": 2, "color": [140, 95, 50] }
  ],
  "spawns": [
    { "type": "player", "x": 2, "y": 2 },
    { "type": "npc", "x": 12, "y": 2, "name": "Guard" }
  ]
}
```

## Key Sections

### 1. Metadata
```json
{
  "name": "My World",
  "version": 1
}
```

### 2. Tiles (Custom Tile Definitions)

Define custom characters and their appearance:

```json
{
  "tiles": {
    ".": {
      "ch": "·",              // Character to display
      "fg": [100, 100, 100],  // RGB foreground color
      "bg": null,             // RGB background color (optional)
      "walkable": true        // Can agents pass through?
    },
    "#": {
      "ch": "█",
      "fg": [80, 80, 80],
      "walkable": false
    }
  }
}
```

**Common tiles:**
- `.` — Floor/path (walkable)
- `#` — Wall (not walkable)
- `,` — Grass (walkable)
- `~` — Water (not walkable)
- `T` — Tree (not walkable, visual)
- `D` — Door (walkable, triggers special door mechanics)
- `e`, `p`, `n`, `h` — Decoration variants

### 3. Grid (The World Layout)

2D ASCII array using your tile characters:

```json
{
  "grid": [
    "###############",
    "#.....~~~~~....#",
    "#.....~~~~~....#",
    "#..............#",
    "###############"
  ]
}
```

Grid dimensions:
- Rows: `grid.length`
- Columns: `grid[0].length`

### 4. Objects (Custom Object Definitions)

Define custom furniture/structures (optional):

```json
{
  "objects": {
    "my-bench": {
      "width": 7,
      "height": 2,
      "palette": {
        "B": { "ch": "█", "fg": [120, 80, 40], "walkable": false },
        "S": { "ch": "█", "fg": [140, 100, 8], "walkable": true }
      },
      "grid": [
        "BSSSSSB",
        "       "
      ]
    }
  }
}
```

Reference:
- **width/height** — Dimensions in cells
- **palette** — Character definitions (like tiles, but for objects)
- **grid** — Object layout using palette characters
- Space character = empty/transparent

### 5. Placements (Object Instances)

Place objects in the world:

```json
{
  "placements": [
    { "object": "sofa", "x": 50, "y": 30 },
    { "object": "tree", "x": 40, "y": 25 },
    { "object": "my-bench", "x": 10, "y": 5 }
  ]
}
```

- **object** — Built-in object name OR custom object from `objects` section
- **x, y** — Top-left position in the grid

### 6. Doors (Dynamic Room Transitions)

Doors create passages between rooms. They **auto-open when agents approach** and **auto-close after agents leave**.

```json
{
  "doors": [
    {
      "x": 36,
      "y": 44,
      "orientation": "horizontal",
      "length": 8,
      "color": [140, 95, 50]
    }
  ]
}
```

**Door Properties:**
- **x, y** — Top-left position of the door
- **orientation** — `"horizontal"` (door spans left-right) or `"vertical"` (door spans up-down)
- **length** — How many cells the door spans (e.g., 8 cells)
- **color** — Door appearance in RGB (e.g., brown wood color)

**How Doors Work:**
1. Initially **CLOSED** (blocks agent movement)
2. Agent approaches within 6 cells → door **AUTO-OPENS**
3. Opens over 4 animation frames (smooth transition)
4. Agent walks through → door is **PASSABLE**
5. Agent leaves → closeTimer starts
6. After ~1.5 seconds → door **AUTO-CLOSES**

**Example: Horizontal Door (8 cells wide)**
```
Grid:
####D D D D D D D D####
#.................#

Door at (4, 0):
- orientation: "horizontal"
- length: 8
- Spans positions (4,0), (5,0), (6,0), (7,0), (8,0), (9,0), (10,0), (11,0)
```

**Example: Vertical Door (6 cells tall)**
```
Grid:
##
#D
#D
#D
#D
#D
##

Door at (1, 1):
- orientation: "vertical"
- length: 6
- Spans positions (1,1), (1,2), (1,3), (1,4), (1,5), (1,6)
```

**Important Rules:**
- ✓ Place doors **on walkable tiles** (`.`, `,`, spaces, etc.)
- ✓ Doors should be at **room boundaries** (between walls)
- ✓ Match door length to the opening width/height
- ✓ Use realistic door colors (wood, metal, etc.) matching adjacent walls
- ✗ Don't place doors on walls (`#`) or solid tiles
- ✗ Don't create overlapping doors

**Common Door Configurations:**
- **Room entrance**: 8-cell horizontal door
- **Narrow passage**: 4-cell vertical door
- **Wide corridor**: 12-16 cell horizontal door

### 7. Spawns (Starting Positions)

Define where agents and NPCs start:

```json
{
  "spawns": [
    { "type": "player", "x": 200, "y": 58 },
    { "type": "npc", "x": 150, "y": 50, "name": "Guard" }
  ]
}
```

- **type** — "player" or "npc"
- **x, y** — Spawn position
- **name** — NPC display name (optional)

## Available Built-in Objects

You can reference these in `placements` without defining them in `objects`:

**Furniture:**
- `sofa`, `sofa_large`, `table`, `bookshelf`, `chair`, `office_chair`

**Structures:**
- `fence_h`, `fence_v`, `sign`, `campfire`

**Natural:**
- `tree`, `pine_tree`, `rock`, `flower_patch`

## Example: Simple Village with Rooms

```json
{
  "name": "Simple Village",
  "version": 1,
  "tiles": {
    ".": { "ch": "·", "fg": [100, 100, 100], "walkable": true },
    "#": { "ch": "█", "fg": [80, 80, 80], "walkable": false },
    ",": { "ch": ",", "fg": [60, 120, 50], "walkable": true }
  },
  "grid": [
    "#################,#################",
    "#......#.......,#.,......#.......",
    "#......#.......,#.,......#.......",
    "#......#.......,#.,......#.......",
    "#.....D.......#...#.....D........",
    "#......#......#...#......#.......",
    "#......#......,#.,......#.......",
    "#......#.......,#.,......#.......",
    "#################,#################"
  ],
  "objects": {},
  "placements": [
    { "object": "sofa", "x": 2, "y": 2 },
    { "object": "table", "x": 8, "y": 2 },
    { "object": "sofa", "x": 20, "y": 2 },
    { "object": "table", "x": 28, "y": 2 }
  ],
  "doors": [
    {
      "x": 7,
      "y": 4,
      "orientation": "horizontal",
      "length": 1,
      "color": [140, 95, 50]
    },
    {
      "x": 27,
      "y": 4,
      "orientation": "horizontal",
      "length": 1,
      "color": [140, 95, 50]
    }
  ],
  "spawns": [
    { "type": "player", "x": 5, "y": 5 },
    { "type": "npc", "x": 25, "y": 5, "name": "Greeter" }
  ]
}
```

**What this creates:**
- Left room with sofa and table
- Middle outdoor area with path
- Right room with sofa and table
- Two doors connect rooms (auto-open when agents approach)
- Player starts in left room
- NPC starts in right room

## Loading a Custom Map

```bash
npx termlings play ./my-map/
```

Termlings will look for `map.json` in the directory and load it automatically.

## Design Tips

### Room Creation with Doors
- **Doors** are positioned on walkable tiles and create natural room boundaries
- Agents pathfind around doors, which auto-open when approached
- Multiple doors can connect different rooms

### Object Placement
- Objects occupy rectangular grid space
- Position (x, y) is the top-left corner of object bounds
- Objects must be placed on walkable tiles
- Objects can't overlap with other blocking objects

### Color Reference
RGB colors work best when:
- Walls (blocking): dark colors (80-100 range)
- Grass/paths (walkable): bright/natural colors
- Water: blue tones (100-150 blue value)
- Objects: vary light/dark for visual depth

### Walkability
- Agents need **7 consecutive walkable cells** to navigate
- Single-cell-wide corridors will block agents
- Doors and passages must be ≥7 cells wide
- Use `D` for doors to connect separated rooms

## Loading Order

When you start a map with `npx termlings play`:

1. ✓ Read map.json
2. ✓ Parse tiles → create tilemap
3. ✓ Parse grid → render world
4. ✓ Parse objects → load custom definitions
5. ✓ Parse placements → place furniture
6. ✓ Parse doors → create transitions
7. ✓ Parse spawns → set agent start positions
8. ✓ Run simulation

## Next Steps

- Check `src/default-map/map.json` for a complete example
- Use `termlings --room mymap` to select a custom map directory
- Agents can place additional objects during gameplay (saved to placements.json)
