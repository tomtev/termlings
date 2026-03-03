# Brand Profile

This folder contains the canonical Termlings brand profile used by humans and agents.

Primary file:

```text
brand/brand.json
brand/profiles/<id>.json
```

Use the CLI to view/update it:

```bash
termlings brand --help
termlings brand show
termlings brand show --profile marketing
termlings brand get colors.primary
termlings brand set voice "Clear, direct, no hype."
termlings brand validate --strict
```

Notes:

- Keep secrets out of this file.
- Store only public brand metadata (colors, logos, voice, domain/email identity).
- Keep paths relative to project root (for example `brand/logo.svg`).

See [docs/BRAND.md](../docs/BRAND.md) for the full schema and command reference.
