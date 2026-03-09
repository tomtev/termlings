# Plans

This directory holds forward-looking product and architecture docs for Termlings.

These are not guarantees of shipped behavior. They describe the intended shape of future apps and platform primitives so implementation can stay coherent as the product grows.

## Current Planning Docs

- [APP-ACTIVITY.md](APP-ACTIVITY.md) - shared file-based activity output for core and future custom apps
- [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) - local-first design system direction
- [MEDIA-APP.md](MEDIA-APP.md) - PRD for image and video generation as one `media` app
- [MEDIA-WORKFLOWS.md](MEDIA-WORKFLOWS.md) - PRD for reusable media generation workflows inside `media`
- [ADS-APP.md](ADS-APP.md) - PRD for a file-based cross-platform `ads` app
- [FINANCE-APP.md](FINANCE-APP.md) - PRD for file-based finance metrics and provider sync
- [ANALYTICS-APP.md](ANALYTICS-APP.md) - PRD for file-based website analytics and reporting
- [EVAL-APP.md](EVAL-APP.md) - PRD for verified outcome-per-token benchmark runs and strategy comparison

## Planning Rules

- Prefer one canonical product direction per area.
- Keep storage file-based and inspectable by default.
- Fit new capabilities into the app model where possible.
- Reuse the shared activity system for cross-app output.
- Keep provider integrations behind small adapters.
