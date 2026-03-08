# Termlings Design and Figma

Status: exploratory idea

Current planned direction now lives in `docs/plans/DESIGN-SYSTEM.md`.

## Recommendation

Use `design.json` as the canonical format.

Use Figma as an adapter target through:

- Plugin API for import/export of design structure
- REST API for remote reading, sync jobs, dev resources, and variables
- `.fig` local copies only as a manual escape hatch

Do not make `.fig` the source of truth.

## Why Not `.fig`

Figma supports saving and importing local `.fig` files, but this is not a good API surface for Termlings:

- `.fig` is a proprietary format
- Figma says the format may change in the future
- reimported files are treated as new files
- local copies do not include comments or version history

This makes `.fig` good for backup and manual transfer, but bad for automation and round-trip tooling.

## Capability Matrix

| Surface | Read | Write | Best use |
| --- | --- | --- | --- |
| `.fig` local copy | Manual | Manual | Backup and manual handoff |
| REST API | Yes | Limited | Inspect files, sync metadata, remote pipelines |
| Plugin API | Yes | Yes | Import/export structure inside the current open file |
| Variables REST API | Yes | Yes | Token sync for Enterprise orgs |
| Buzz API | Yes | Yes | Dynamic marketing assets in Figma Buzz, later if needed |

## What Figma Officially Supports

### REST API

The REST API is best thought of as a remote inspection API.

It is good for:

- reading files and nodes
- reading images and metadata
- comments
- dev resources
- variables

It is not the right tool for generic file editing. Figma's own API comparison says the REST API is largely read-only, with exceptions for comments, variables, and dev resources.

Implication:

- use REST to read existing Figma files into Termlings
- do not plan on REST as the primary `design.json -> Figma` writer

### Plugin API

The Plugin API is the real write surface for Termlings.

It supports:

- read and write access to the current open file
- creating and modifying nodes
- auto layout properties like `layoutMode`, sizing modes, padding, spacing, and alignment
- text node creation and editing
- variables and variable binding
- component properties and instance property overrides
- JSON REST export from selected nodes with `exportAsync({ format: "JSON_REST_V1" })`
- private and shared metadata on nodes via `setPluginData` and `setSharedPluginData`

Implication:

- build a Termlings Figma plugin as the main bridge
- keep the Termlings file model local and deterministic
- round-trip through plugin metadata where Figma cannot represent the full Termlings model

### Local Copy Import/Export

Figma Help confirms:

- users can save local copies as `.fig`
- users can import `.fig` files back into Figma
- imported files are treated as new files
- version history and comments are not preserved
- Figma recommends third-party tools use official APIs instead of `.fig`

Implication:

- do not generate or parse `.fig`
- support a human workflow that ends in `.fig` only if a user manually exports from Figma

## Recommended Termlings -> Figma Architecture

### Canonical Local Model

Termlings owns:

- `design.json`
- token resolution
- dynamic props
- `fitText`
- render semantics

Figma receives a projected version of that model.

### Import Path

`design.json -> Figma plugin -> current Figma file`

Recommended behavior:

1. Open or create a Figma file.
2. Run the Termlings plugin.
3. Upload or paste `design.json`.
4. Plugin resolves brand tokens and props defaults.
5. Plugin creates or updates nodes in place using stable Termlings IDs.

Recommended metadata per node:

- `termlings:id`
- `termlings:type`
- `termlings:binding`
- `termlings:fitText`
- `termlings:component`
- `termlings:sourceHash`

Store private round-trip metadata with `setPluginData`.

Use `setSharedPluginData` only if you intentionally want other plugins to be able to read the metadata.

### Export Path

`Figma selection or page -> Figma plugin -> design.json`

Recommended behavior:

1. User selects a frame, component, or page.
2. Plugin reads node data directly.
3. If the content was originally imported from Termlings, plugin prefers `setPluginData` metadata.
4. For bulk subtree serialization, plugin can use `exportAsync({ format: "JSON_REST_V1" })`.
5. Plugin converts the Figma subtree into the constrained `design.json` schema.

Export modes:

- `strict`: only export nodes that fit the Termlings schema cleanly
- `best-effort`: convert what is possible and annotate unsupported fields

## Mapping `design.json` to Figma

### Structure

Recommended mappings:

- `screen` -> page or top-level frame
- `box` -> frame
- `text` -> text node
- `image` -> rectangle or frame with image fill
- `svg` -> vector or imported SVG
- `instance` -> instance node

### Layout

Recommended mappings:

- `flex flex-col` -> `layoutMode = "VERTICAL"`
- `flex flex-row` -> `layoutMode = "HORIZONTAL"`
- `gap-*` -> `itemSpacing`
- `p-*`, `px-*`, `py-*` -> frame padding
- fill / hug behavior -> sizing modes and layout settings

This is a strong fit because Figma auto layout and the Plugin API already expose the same core concepts.

### Tokens and Variables

Recommended mappings:

- Termlings semantic tokens -> Figma variable collection named `Termlings`
- `primary`, `secondary`, `accent`, `background`, `foreground`, `border`, `muted`, `muted-foreground` -> variables
- bind node fields to variables where a native variable binding exists

Good candidates for variable binding:

- fills
- strokes
- width and size values where supported
- component property values where supported

Notes:

- Plugin API variable creation and binding is available now
- Variables REST API can also sync variables, but current official docs say this write path requires Enterprise access

## Dynamic Props and Design Assets

This is where Termlings can be stronger than Figma Design.

Recommended `design.json` model:

```json
{
  "props": {
    "title": { "type": "string", "default": "Launch faster" },
    "subtitle": { "type": "string", "default": "Ship branded assets from one template." },
    "theme": { "type": "enum", "default": "default", "options": ["default", "alt"] },
    "showBadge": { "type": "boolean", "default": true },
    "heroImage": { "type": "image" }
  }
}
```

### Figma Design Mapping

For reusable asset templates:

- `string` props -> TEXT component properties
- `boolean` props -> BOOLEAN component properties
- simple `enum` props -> VARIANT or TEXT property depending on usage
- `instance`-like swaps -> INSTANCE_SWAP component properties

This is a good fit because Figma component properties and `setProperties()` already support editable text, booleans, and swaps.

### Text Binding

When importing into Figma:

- create a component for reusable assets
- add component properties on the component
- attach sublayer `characters` references to those component properties
- create instances for concrete renders if needed

This preserves editable text in the Figma UI and keeps a usable designer workflow.

### Image and Media Props

This is less native in Figma Design than text props.

Recommended v1 approach:

- Termlings keeps image props as first-class local props
- Figma import writes the current resolved image into fills
- plugin metadata preserves the original prop binding
- if a media slot behaves like a swappable subcomponent, map it to `INSTANCE_SWAP`

For true media-template workflows, Figma Buzz is more promising than Figma Design.

## fitText and Auto Font Size

This is a major place where Termlings should lead and Figma should follow.

Recommended Termlings `fitText.mode` values:

- `none`
- `height`
- `truncate`
- `shrink`

### Clean Figma Mappings

- `height` -> `textAutoResize = "HEIGHT"`
- hug text -> `textAutoResize = "WIDTH_AND_HEIGHT"`
- `truncate` -> `textTruncation = "ENDING"` plus `maxLines`

### Non-Clean Mapping

`shrink` does not have a true native equivalent in Figma Design.

Recommended strategy:

- Termlings computes shrink-to-fit during local rendering
- Figma plugin computes a best-fit font size at import time
- plugin stores the original `fitText` rule in node metadata
- export restores the original Termlings `fitText` rule from metadata

That gives designers a visually close Figma file without pretending the behavior is natively preserved.

## Round-Trip Strategy

To make round-tripping reliable, the plugin should preserve Termlings intent explicitly.

Recommended metadata rules:

- every imported node gets a stable `termlings:id`
- prop-bound nodes store the prop name
- `fitText` rules store original mode and bounds
- components store whether they came from `component` or `screen`
- nodes with no clean reverse mapping are marked as lossy

Recommended export policy:

- if Termlings metadata exists, trust it first
- if metadata is missing, infer a best-effort Termlings node
- if inference is ambiguous, emit an explicit warning in export output

## Fidelity Bands

### Lossless or Near-Lossless for V1

- frames and groups that map to frames
- vertical and horizontal auto layout
- padding, gap, alignment
- plain text nodes
- solid fills, strokes, corner radius
- semantic variable-backed colors
- local components and instances
- text, boolean, and instance-swap component properties

### Mostly Lossless

- truncating text
- variants used as enum-like switches
- library components after import into the current file
- exported REST JSON subtrees converted into Termlings structure

### Lossy

- shrink-to-fit typography
- image and media props in Figma Design
- complex `tw` strings when multiple Figma properties need to collapse back into one small semantic class string
- advanced visual effects not covered by the Termlings v1 schema

### Out of Scope for V1

- prototyping flows
- comments and version history
- direct `.fig` generation/parsing
- full vector network parity
- full responsive behavior
- full Figma feature coverage

## Where Figma Buzz Fits

Figma Buzz is interesting for "design assets++" because its API already has:

- text content extraction
- media content extraction
- asset typing
- smart resize

That makes Buzz a potentially strong future adapter for campaign assets and bulk creative generation.

But Buzz should not be the base target for v1 because:

- it is a different editor and file type
- it narrows the compatibility story
- the core problem is broader than marketing templates

Recommendation:

- target Figma Design first
- keep Buzz as an optional later adapter for high-volume asset templates

## Suggested Build Order

1. Local `design.json` renderer in Termlings
2. Figma plugin: import `design.json` into the current file
3. Figma plugin: export selected frame/component back to `design.json`
4. Variable collection sync
5. Component property support for prop-bound text and booleans
6. Improved round-trip metadata and relaunch actions
7. Optional Buzz adapter for asset-template workflows

## Bottom Line

The best strategy is:

- Termlings owns the model
- Plugin owns the structural bridge
- REST owns remote read/sync workflows
- `.fig` stays manual only

This is the cleanest way to get:

- fast local AI editing
- real Figma interoperability
- stable round-trip behavior
- support for dynamic text-driven design assets

## Official References

- Figma REST API introduction: https://developers.figma.com/docs/rest-api
- Compare the Figma APIs: https://developers.figma.com/compare-apis
- Plugin API introduction: https://developers.figma.com/docs/plugins
- Export settings / JSON REST export: https://developers.figma.com/docs/plugins/api/ExportSettings
- Auto layout `layoutMode`: https://developers.figma.com/docs/plugins/api/properties/nodes-layoutmode/
- Text node and `textAutoResize`: https://developers.figma.com/docs/plugins/api/TextNode/ and https://developers.figma.com/docs/plugins/api/properties/TextNode-textautoresize/
- Variables guide: https://developers.figma.com/docs/plugins/working-with-variables/
- Variables REST API: https://developers.figma.com/docs/rest-api/variables/
- Component properties: https://developers.figma.com/docs/plugins/api/ComponentProperties/ and https://developers.figma.com/docs/plugins/api/InstanceNode/
- Plugin metadata: https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/ and https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/
- Save a local copy: https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files
- Import files into Figma: https://help.figma.com/hc/en-us/articles/360041003114-Import-files-to-the-file-browser
- Figma Buzz API: https://developers.figma.com/docs/plugins/api/figma-buzz/
