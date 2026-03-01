# Avatar Visualization

Visualize termling avatars and world objects with the `avatar` command.

## Quick Start

```bash
termlings avatar 2c5f423              # Render by DNA
termlings avatar alice                # Render by name
termlings avatar                      # Random avatar
termlings avatar --help               # Full documentation
```

## Avatar DNA

Each termling has a unique **7-character hex DNA string** (~32 million combinations):

```bash
termlings avatar 2c5f423 --info       # Show DNA traits
# Output:
# {
#   "skin": "tan",
#   "body": "slim",
#   "clothing": "jacket",
#   "hair": "curly",
#   "colors": [120, 45, 200]
# }
```

DNA encodes:
- Skin tone
- Body type
- Clothing style
- Hair style
- Two color hues

## Output Formats

### Terminal (default)
```bash
termlings avatar alice
# Renders in terminal with ANSI colors
```

Perfect for:
- CLI automation and scripts
- Server environments
- Quick visualization
- Team coordination messages

### Web (in UI)
The web workspace automatically displays avatars:

1. **Agent cards** - Shows avatar in agent list
2. **Message streams** - Avatar next to each message
3. **Task assignments** - Shows who's assigned to each task
4. **Calendar events** - Shows assigned agents visually

Avatars render automatically with no extra setup needed.

### SVG (scalable vector)
```bash
termlings avatar alice --svg > avatar.svg
termlings avatar alice --svg --size 50 --bg "#ffffff"
```

Perfect for:
- Web pages and applications
- Presentations
- Print materials
- CSS animations

Options:
- `--size <px>` - Avatar size (default: 10)
- `--bg <color>` - Background color (hex or "none")
- `--padding <n>` - Padding in pixels (default: 1)

### Animated SVG
```bash
termlings avatar alice --svg --animated --walk
# Outputs: idle, walking, talking, waving animations
```

Includes CSS animations for:
- Idle (default)
- Walking (`--walk`)
- Talking (`--talk`)
- Waving (`--wave`)

Perfect for:
- Interactive web dashboards
- Marketing materials
- Animated presentations

### MP4 Video
```bash
termlings avatar alice --mp4 --walk --duration 3 --out alice.mp4
# Requires: ffmpeg
```

Perfect for:
- Video presentations
- Social media
- Documentation
- Team introductions

Options:
- `--walk` / `--talk` / `--wave` - Animation type
- `--duration <seconds>` - Video length (default: 3)
- `--out <file>` - Output filename (default: termling.mp4)
- `--fps <n>` - Frame rate (default: 4)

## Styling

```bash
# Black and white
termlings avatar alice --bw

# Compact (half height)
termlings avatar alice --compact

# Random DNA
termlings avatar --random
```

## Objects

Render world objects:

```bash
termlings avatar object table                   # Render object
termlings avatar object table --list            # List all objects
termlings avatar object table --color 200,100,50  # Custom RGB color
termlings avatar object table --debug-collision    # Show collision
```

Collision legend:
- `.` = transparent
- `█` = solid/blocking
- `░` = walkable surface

## Creating Agents with Custom DNA

When creating an agent, you can specify DNA:

```bash
termlings create --name "Alice" --dna 2c5f423
```

This creates an agent with a specific visual identity.

## Use Cases

**Agent Onboarding:** Generate unique avatars for new team members

**Presentations:** Export avatars as SVG or MP4 for slides

**Debugging:** View avatar DNA to understand termling identity

**Art:** Create custom termling avatars with specific color schemes
