# Ads App PRD

Status: planned

`ads` should be a separate Termlings app for file-based ad operations across paid acquisition platforms.

It should manage:

- ad accounts
- campaigns
- ad groups / ad sets
- creatives
- spend and budget state
- performance snapshots
- reporting and optimization suggestions

Target platforms:

- Meta (Facebook + Instagram)
- Google Ads
- TikTok
- Snapchat

## Why Separate From Media

`ads` should not be merged into `media`.

Reasons:

- media generation is asset creation
- ads management is a persistent operational system
- ads needs account, campaign, budget, and metrics models
- ads should consume media outputs, not define media generation itself

So the split should be:

- `media`
  generate creatives
- `ads`
  deploy, track, and optimize them

## Product Goals

Termlings should let agents and operators:

1. inspect ad accounts and active campaigns from one CLI
2. create and update campaigns using normalized local models
3. attach generated creatives and brand-aware assets
4. sync performance metrics into file-backed history
5. produce reporting and optimization suggestions from local snapshots

## Non-Goals

V1 should not try to be:

- a full BI warehouse
- a real-time dashboard system
- a clickstream attribution engine
- a universal martech replacement
- a broad connectors platform before a few ad providers work well

## Storage Layout

```text
.termlings/
  store/
    ads/
      accounts.json
      campaigns/
        cmp_meta_abc123.json
        cmp_google_def456.json
      creatives/
        creative_abc123.json
      reports/
        rpt_2026-03-08_7d.json
      metrics/
        cmp_meta_abc123.daily.jsonl
      sync-state.json
```

This should stay file-based and inspectable.

## Canonical Models

### Account

```json
{
  "id": "acct_meta_123",
  "platform": "meta",
  "name": "Acme Main",
  "currency": "USD",
  "timezone": "Europe/Oslo",
  "status": "active"
}
```

### Campaign

```json
{
  "id": "cmp_meta_abc123",
  "platform": "meta",
  "accountId": "acct_meta_123",
  "name": "Spring Launch",
  "objective": "traffic",
  "status": "active",
  "budget": {
    "amount": 150,
    "period": "daily",
    "currency": "USD"
  },
  "creativeIds": ["creative_abc123"],
  "targeting": {
    "geo": ["US"],
    "audiences": ["founders", "saas"],
    "placements": ["facebook_feed", "instagram_feed"]
  },
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000
}
```

### Metrics Snapshot

```json
{
  "ts": 1770000000000,
  "campaignId": "cmp_meta_abc123",
  "platform": "meta",
  "spend": 143.22,
  "impressions": 18234,
  "clicks": 621,
  "ctr": 0.034,
  "cpc": 0.23,
  "conversions": 17,
  "cpa": 8.42,
  "roas": 2.14
}
```

## CLI Shape

```bash
termlings ads accounts
termlings ads campaigns list
termlings ads campaign show <id>
termlings ads campaign create ...
termlings ads campaign update <id> ...
termlings ads creative attach <campaign-id> <media-job|path>
termlings ads metrics <campaign-id>
termlings ads report --last 7d
termlings ads pause <campaign-id>
termlings ads resume <campaign-id>
```

Useful flags:

```bash
--platform <meta|google|tiktok|snapchat>
--account <id>
--status <status>
--objective <objective>
--budget <amount>
--currency <code>
--last <window>
--json
```

## Examples

```bash
termlings ads accounts
termlings ads campaigns list --platform meta
termlings ads campaign create --platform google --account acct_google_123 --name "Spring Launch" --objective conversions --budget 200
termlings ads creative attach cmp_meta_abc123 .termlings/store/media/outputs/img_abc123.png
termlings ads metrics cmp_meta_abc123
termlings ads report --last 7d
termlings ads pause cmp_meta_abc123
```

## Sync Model

`ads` should be sync-oriented, not stream-oriented.

That means:

- sync account and campaign state on demand
- write normalized snapshots locally
- store metrics as append-only daily or hourly lines
- compute summaries from local files

This fits Termlings much better than live dashboard coupling.

## Performance Tracking

V1 should normalize a small common metrics set:

- spend
- impressions
- clicks
- CTR
- CPC
- conversions
- CPA
- ROAS

Platform-specific extras can go in `meta`.

## Activity Feed

`ads` should emit shared app activity like:

- `ads.sync.completed`
- `ads.campaign.created`
- `ads.campaign.updated`
- `ads.campaign.paused`
- `ads.creative.attached`
- `ads.report.generated`
- `ads.alert.performance-drop`

These should use the shared activity system under `.termlings/store/activity/`.

## Integrations

`ads` should connect naturally to:

- `media`
  for generated image and video creatives
- `brand`
  for campaign-safe creative defaults and tone
- `crm`
  later, for attribution and audience loops
- `requests`
  for human approvals, credential release, and platform connection steps

## Human-in-the-Loop

Ads operations often need operator control.

Important human-touch surfaces:

- first-time account connection
- billing-sensitive changes
- large budget edits
- campaign pause/resume on important live spend
- approvals for publishing new creatives

So `ads` should be designed to work well with `requests`, even if approval automation is not part of v1.

## Provider API

Keep platform logic behind a narrow adapter layer:

```ts
type AdsProvider = {
  listAccounts(): Promise<AdsAccount[]>
  listCampaigns(input: CampaignQuery): Promise<AdsCampaign[]>
  createCampaign(input: CreateCampaignInput): Promise<AdsCampaign>
  updateCampaign(input: UpdateCampaignInput): Promise<AdsCampaign>
  pauseCampaign(id: string): Promise<void>
  resumeCampaign(id: string): Promise<void>
  fetchMetrics(input: MetricsQuery): Promise<AdsMetricSnapshot[]>
}
```

This should normalize the common model but leave platform-specific payloads in `meta`.

## V1 Boundary

Keep v1 narrow:

- one app: `ads`
- Meta + Google first
- campaign read/update flows
- creative attachment from local files or `media` outputs
- normalized metrics snapshots
- simple local reports
- shared activity events

TikTok and Snapchat can come after the first two providers are solid.

Do not add in v1:

- automated bidding logic
- audience sync pipelines
- attribution modeling
- operator dashboards with live streaming
- multi-touch conversion science

## Success Criteria

V1 is successful if:

- an operator or agent can inspect ad account and campaign state from one CLI
- campaigns can be created or updated through normalized commands
- generated media can be attached cleanly
- performance can be tracked from local snapshots
- `ads` becomes a stable foundation for future reporting and optimization workflows
