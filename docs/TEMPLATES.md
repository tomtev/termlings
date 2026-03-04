# Templates

Termlings templates define the initial `.termlings/` content copied during `termlings init`.

## Usage

```bash
# Local bundled template
termlings init --template default
termlings init --template executeive-team
termlings init --template personal-assistant

# Git template (branch/tag via #ref)
termlings init --template https://github.com/your-org/termlings-template.git#main

# git+ prefix is also supported
termlings init --template git+https://github.com/your-org/termlings-template.git#v1
```

## Supported Template References

- Local name: `default`, `executeive-team`, `personal-assistant`
- Git URL: `https://...`, `git+https://...`, `ssh://...`, `git@...`, `file://...`
- Optional branch or tag: append `#<ref>`

## Template Layout

A template repository (or local template directory) should place entries at repository root:

```text
agents/
humans/
store/
brand/
VISION.md
README.md
spawn.json
```

Only the entries above are copied into `.termlings/`.

## Copy Semantics

- Initialization is non-destructive for existing files (`cp` without force overwrite).
- `termlings init --force` re-runs setup flow when `.termlings/` already exists.
- If the template is missing or contains none of the supported entries, init fails.

## Notes

- `#<ref>` is intended for branch/tag selection.
- Git templates are cloned to a temporary directory and cleaned up after copy.
- `spawn.json` should use:
  - `default` (workspace runtime/preset)
  - `agents` (per-agent runtime/preset overrides by slug)
  - `runtimes` (preset command catalog)
