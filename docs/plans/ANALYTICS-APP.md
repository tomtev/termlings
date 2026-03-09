# Analytics App PRD

Status: planned

`analytics` should be a separate Termlings app for file-based website and product analytics sync.

It should start with simple integrations like:

- Google Analytics
- plausible lightweight alternatives later

It should normalize:

- traffic metrics
- acquisition channels
- landing pages
- conversions
- simple time-window reports

## Goal

Termlings should let agents and operators:

1. inspect basic traffic and conversion metrics from one CLI
2. sync analytics provider state into local files
3. compare traffic windows over time
4. use those metrics in `brief`, reports, and future planning
5. emit analytics changes and alerts into the shared activity feed

## Why Separate From Ads And Finance

`analytics` should not be folded into `ads` or `finance`.

Reasons:

- ads tracks paid acquisition operations
- finance tracks subscriptions and revenue
- analytics tracks traffic, product usage, and conversion behavior

These systems should connect, but they should not share one storage model.

The clean split should be:

- `ads`
  campaigns, creatives, spend
- `analytics`
  visits, acquisition, landing pages, conversions
- `finance`
  subscriptions, revenue, refunds

## Product Goals

V1 should make it easy to answer:

- how much traffic did we get?
- which channels are driving visits?
- which landing pages are performing?
- what changed compared with the last period?
- are conversions improving or dropping?

## Non-Goals

V1 should not try to be:

- a full product analytics suite
- a warehouse-backed BI system
- a session replay platform
- an event instrumentation system
- a live dashboard framework

## Storage Layout

```text
.termlings/
  store/
    analytics/
      properties.json
      traffic/
        daily.jsonl
      channels/
        daily.jsonl
      pages/
        landing-pages.jsonl
      conversions/
        daily.jsonl
      reports/
        rpt_2026-03-08_30d.json
      sync-state.json
```

This should stay file-based and inspectable.

## Canonical Models

### Property

```json
{
  "id": "ga4_main",
  "provider": "google-analytics",
  "name": "Main Website",
  "site": "termlings.com",
  "status": "active"
}
```

### Traffic Snapshot

```json
{
  "ts": 1770000000000,
  "window": "daily",
  "sessions": 2841,
  "users": 2314,
  "pageviews": 6932,
  "bounceRate": 0.41,
  "avgSessionDuration": 72.3
}
```

### Channel Snapshot

```json
{
  "ts": 1770000000000,
  "channel": "organic_search",
  "sessions": 913,
  "users": 801,
  "conversions": 27
}
```

### Landing Page Snapshot

```json
{
  "ts": 1770000000000,
  "path": "/",
  "sessions": 1184,
  "users": 1022,
  "conversions": 31,
  "conversionRate": 0.026
}
```

## CLI Shape

```bash
termlings analytics properties
termlings analytics sync
termlings analytics traffic
termlings analytics channels
termlings analytics pages
termlings analytics conversions
termlings analytics report
```

Useful flags:

```bash
--provider <google-analytics|plausible>
--last <window>
--path <route>
--channel <id>
--json
```

## Examples

```bash
termlings analytics properties
termlings analytics sync --provider google-analytics
termlings analytics traffic --last 30d
termlings analytics channels --last 30d
termlings analytics pages --last 30d
termlings analytics report --last 30d
```

## Sync Model

`analytics` should be sync-oriented.

That means:

- fetch provider metrics on demand or on a schedule
- write normalized local snapshots
- compute reports from local files
- compare current vs previous windows locally

This fits Termlings better than trying to become a hosted analytics UI.

## Core Metrics

V1 should normalize a small, common set:

- sessions
- users
- pageviews
- bounce rate
- average session duration
- conversions
- conversion rate

Traffic source dimensions:

- channel
- source / medium
- landing page

Provider-specific extras can go in `meta`.

## Reports

`analytics report` should generate file-backed summaries like:

- last 7 days
- last 30 days
- month to date

Reports should summarize:

- traffic trend
- top channels
- top landing pages
- conversion changes
- notable drops or spikes

## Activity Feed

`analytics` should emit shared app activity like:

- `analytics.sync.completed`
- `analytics.report.generated`
- `analytics.alert.traffic-drop`
- `analytics.alert.conversion-drop`
- `analytics.alert.channel-spike`

These should use the shared activity system under `.termlings/store/activity/`.

## Integrations

`analytics` should connect naturally to:

- `ads`
  later, for paid spend vs traffic and acquisition comparisons
- `finance`
  later, for traffic-to-revenue visibility
- `brief`
  for workspace/business snapshots
- `requests`
  for credential setup and operator-managed provider auth

## Human-in-the-Loop

Analytics data is usually lower-risk than finance, but still important.

Human-touch surfaces:

- first-time provider setup
- property selection
- conversion definition sanity checks
- report interpretation for important business decisions

## Provider API

Keep provider logic behind a narrow adapter:

```ts
type AnalyticsProvider = {
  listProperties(): Promise<AnalyticsProperty[]>
  syncTraffic(input: AnalyticsQuery): Promise<TrafficSnapshot[]>
  syncChannels(input: AnalyticsQuery): Promise<ChannelSnapshot[]>
  syncPages(input: AnalyticsQuery): Promise<PageSnapshot[]>
  syncConversions(input: AnalyticsQuery): Promise<ConversionSnapshot[]>
}
```

Provider-specific payloads can live in `meta`, but the app should normalize the common model.

## Auth Model

V1 should use `.termlings/.env` for provider credentials, usually added via `termlings request env ... --scope termlings`.

Examples:

```bash
termlings request env GOOGLE_ANALYTICS_PROPERTY_ID "Needed for analytics sync" --scope termlings
termlings request env GOOGLE_ANALYTICS_CLIENT_EMAIL "Needed for analytics sync" --scope termlings
termlings request env GOOGLE_ANALYTICS_PRIVATE_KEY "Needed for analytics sync" --scope termlings
```

Later, OAuth-heavy providers can move behind connectors or brokered integrations without changing the analytics app’s storage model.

## V1 Boundary

Keep v1 narrow:

- one app: `analytics`
- Google Analytics first
- simple traffic/channel/page/conversion sync
- normalized local snapshots
- basic reports
- shared activity events

Do not add in v1:

- event-level product analytics
- session replay
- cohort analysis
- funnel builders
- custom dashboard builders

## Success Criteria

V1 is successful if:

- an operator can inspect basic traffic and conversion metrics from one CLI
- Google Analytics data can be synced into local files
- current vs prior traffic windows are understandable from local reports
- `brief` can consume analytics summaries later without custom glue
- analytics becomes a clean foundation for future growth and product reporting
