# Deploy

This file lives in `apps/web` inside the main `termlings` monorepo.

It documents how to publish a new `termlings` CLI version to npm and create the matching GitHub release.

## Scope

This deploy flow is for the `termlings` package repo:

- repo: `tomtev/termlings`
- npm package: `termlings`
- GitHub releases: `https://github.com/tomtev/termlings/releases`

The website reads npm and GitHub release metadata automatically, so there is usually no separate website content change required for a normal package release.

## Preconditions

- Work from the `termlings` repository, not `termlings-web`.
- Release from `main`.
- `package.json` already contains the target version.
- The working tree must be clean before `npm publish` so npm and GitHub point at the same code.
- `bun`, `npm`, and `gh` must be installed.
- `gh auth status` must show an authenticated GitHub session.
- npm auth must be available either through normal npm login or through the local `.env` helper described below.

## Release Flow

1. Verify branch, cleanliness, upstream, and current version.

```bash
node -p "require('./package.json').version"
git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git log --oneline --decorate -3
```

2. Confirm the committed `HEAD` version matches `package.json`.

```bash
git show HEAD:package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version"
```

3. Run the full test suite.

```bash
bun test
```

4. Check the current published npm version and current GitHub releases.

```bash
npm view termlings version dist-tags --json
gh release list --repo tomtev/termlings --limit 10
npm pack --dry-run
```

5. Verify npm auth.

Standard auth flow:

```bash
npm whoami
```

If your local setup stores the npm token in `.env` as `NPM_VAR`, use a temporary npm config instead of writing credentials into the repo:

```bash
zsh -lc 'set -a; source .env >/dev/null 2>&1; set +a; tmp=$(mktemp); trap "rm -f $tmp" EXIT; printf "//registry.npmjs.org/:_authToken=%s\n" "$NPM_VAR" > "$tmp"; NPM_CONFIG_USERCONFIG="$tmp" npm whoami'
```

6. Publish to npm.

Standard auth flow:

```bash
npm publish --access public
```

If using the local `.env` helper:

```bash
zsh -lc 'set -a; source .env >/dev/null 2>&1; set +a; tmp=$(mktemp); trap "rm -f $tmp" EXIT; printf "//registry.npmjs.org/:_authToken=%s\n" "$NPM_VAR" > "$tmp"; NPM_CONFIG_USERCONFIG="$tmp" npm publish --access public'
```

7. Verify npm `latest` moved to the new version.

```bash
npm view termlings version dist-tags --json
```

8. Create the matching GitHub release and tag from the current commit.

```bash
VERSION=$(node -p "require('./package.json').version")
SHA=$(git rev-parse HEAD)
gh release create "v$VERSION" --target "$SHA" --title "v$VERSION" --generate-notes --latest
```

9. Verify the GitHub release now shows as `Latest`.

```bash
gh release list --repo tomtev/termlings --limit 5
```

## Notes

- `npm publish` does not create a Git tag or GitHub release.
- GitHub's `Latest` badge only tracks GitHub Releases.
- If npm already has that version, bump `package.json`, commit it, and rerun the flow.
- Never commit tokens, `.env` files, or npm auth config into any repository.
- If the website still shows the old release immediately after publishing, allow a few minutes for cache and metadata propagation.
