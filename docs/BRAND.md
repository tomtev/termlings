# Brand Profiles (`.termlings/brand/`)

`termlings brand` manages canonical brand profiles for agents and tooling.
Current default behavior uses the `default` profile.

```text
.termlings/brand/brand.json
.termlings/brand/profiles/<id>.json
```

Use this for public brand metadata only:
- name and voice/tone
- color tokens
- logo asset paths
- domain and email identity fields

Do not store secrets.

## CLI

```bash
termlings brand --help
termlings brand show [--profile <id>] [--json]
termlings brand init [--profile <id>] [--name <name>] [--primary <hex>] [--logo <path>] [--domain <domain>] [--email <email>] [--force]
termlings brand extract [--profile <id>] [--from tailwind,shadcn,css,logos,package] [--write] [--replace] [--json]
termlings brand get <path> [--profile <id>] [--json]
termlings brand set <path> <value> [--profile <id>] [--json-value]
termlings brand validate [--profile <id>] [--strict] [--json]
termlings brand profiles [--json]
termlings brand schema [--json]
```

`--profile <id>` defaults to `default`.

## Schema

```json
{
  "schemaVersion": 1,
  "name": "Termlings",
  "voice": "Clear, pragmatic, direct. Friendly but not fluffy. Avoid hype and jargon.",
  "colors": {
    "primary": "#574747",
    "secondary": "#F4F4F5",
    "accent": "#F4F4F5",
    "background": "#FFFFFF",
    "foreground": "#09090B",
    "palette": []
  },
  "logos": {
    "main": "",
    "mark": "",
    "favicon": ""
  },
  "identity": {
    "domain": {
      "primary": "termlings.com",
      "website": "https://termlings.com",
      "app": "",
      "docs": "",
      "api": ""
    },
    "email": {
      "fromName": "Termlings",
      "fromAddress": "",
      "replyTo": "",
      "support": "",
      "sales": "",
      "security": "",
      "noreply": ""
    }
  },
  "sources": [],
  "updatedAt": "2026-03-03T00:00:00.000Z"
}
```

## Examples

```bash
# Create a new file
termlings brand init --name "Acme" --domain "acme.com"

# Create/show another profile
termlings brand init --profile marketing --name "Acme Marketing"
termlings brand show --profile marketing

# Extract from project files and save
termlings brand extract --from tailwind,shadcn,css,logos,package --write

# Read one field
termlings brand get colors.primary

# Update one field
termlings brand set voice "Direct, confident, practical."

# Update complex value
termlings brand set colors.palette '["#111111","#FFFFFF"]' --json-value

# Validate
termlings brand validate --strict
```

## Disable This App

Disable `brand` for all agents in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "brand": false
    }
  }
}
```

You can override that for a specific agent under `apps.agents.<slug>`. See [APPS.md](APPS.md).
