# Finance App PRD

Status: planned

`finance` should be a separate Termlings app for file-based business metrics, revenue tracking, and payment platform sync.

It should start with:

- Stripe
- Polar

It should normalize:

- customers
- subscriptions
- invoices
- charges
- refunds
- revenue and subscription metrics
- simple reports

## Goal

Termlings should let agents and operators:

1. inspect business performance from one CLI
2. sync Stripe and Polar state into local files
3. compute core subscription and revenue metrics from normalized snapshots
4. use those metrics in `brief`, reporting, and future planning flows
5. track finance-related changes through the shared activity feed

## Why Separate From CRM And Ads

`finance` should not be folded into `crm` or `ads`.

Reasons:

- CRM tracks relationships and next actions
- ads tracks paid acquisition operations
- finance tracks cashflow, subscriptions, and business performance

The clean split should be:

- `crm`
  people, orgs, deals, relationships
- `ads`
  campaigns, creatives, ad spend, acquisition operations
- `finance`
  revenue, subscriptions, invoices, charges, business metrics

These apps should integrate, but they should not share one storage model.

## Product Goals

V1 should make it easy to answer:

- what is current MRR?
- how many active subscriptions exist?
- what changed this week?
- did revenue grow or shrink?
- how much did refunds increase?
- which customers or subscriptions changed recently?

## Non-Goals

V1 should not try to be:

- a full accounting system
- a bookkeeping ledger
- a tax engine
- a bank reconciliation tool
- a data warehouse
- a full BI dashboard suite

## Storage Layout

```text
.termlings/
  store/
    finance/
      providers.json
      customers/
        cus_stripe_abc123.json
      subscriptions/
        sub_stripe_def456.json
      invoices/
        inv_stripe_ghi789.json
      charges/
        ch_stripe_xyz111.json
      refunds/
        rf_stripe_xyz222.json
      metrics/
        daily.jsonl
        mrr.jsonl
      reports/
        rpt_2026-03-08_30d.json
      sync-state.json
```

This should stay file-based and inspectable.

## Canonical Models

### Provider Account

```json
{
  "id": "acct_stripe_main",
  "provider": "stripe",
  "name": "Main Stripe Account",
  "currency": "USD",
  "status": "active"
}
```

### Customer

```json
{
  "id": "cus_stripe_abc123",
  "provider": "stripe",
  "providerCustomerId": "cus_123",
  "email": "founder@acme.com",
  "name": "Acme",
  "status": "active",
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000
}
```

### Subscription

```json
{
  "id": "sub_stripe_def456",
  "provider": "stripe",
  "providerSubscriptionId": "sub_123",
  "customerId": "cus_stripe_abc123",
  "status": "active",
  "plan": "pro-monthly",
  "interval": "month",
  "amount": 4900,
  "currency": "USD",
  "startedAt": 1770000000000,
  "cancelAt": null,
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000
}
```

### Metrics Snapshot

```json
{
  "ts": 1770000000000,
  "window": "daily",
  "currency": "USD",
  "mrr": 18200,
  "arr": 218400,
  "activeSubscriptions": 37,
  "newSubscriptions": 4,
  "churnedSubscriptions": 1,
  "revenue": 2160,
  "refunds": 49,
  "netRevenue": 2111
}
```

## CLI Shape

```bash
termlings finance accounts
termlings finance sync
termlings finance metrics
termlings finance revenue
termlings finance customers
termlings finance subscriptions
termlings finance invoices
termlings finance report
```

Useful flags:

```bash
--provider <stripe|polar>
--last <window>
--customer <id>
--status <status>
--json
```

## Examples

```bash
termlings finance accounts
termlings finance sync --provider stripe
termlings finance metrics --last 30d
termlings finance revenue --last 12m
termlings finance subscriptions --status active
termlings finance report --last 30d
```

## Sync Model

`finance` should be sync-oriented.

That means:

- fetch provider records on demand or on scheduled sync
- store normalized local files
- append metric snapshots over time
- compute reports from local state

This fits Termlings much better than tying the app to live hosted dashboards.

## Core Metrics

V1 should normalize a small, useful set:

- MRR
- ARR
- active subscriptions
- new subscriptions
- churned subscriptions
- revenue
- refunds
- net revenue

Possible later metrics:

- ARPU / ARPA
- churn rate
- expansion revenue
- contraction revenue
- LTV
- payback period

## Reports

`finance report` should generate file-backed reports like:

- last 7 days
- last 30 days
- month to date
- quarter to date

Reports should summarize:

- revenue trend
- subscription movement
- refund changes
- notable account activity

## Activity Feed

`finance` should emit shared app activity like:

- `finance.sync.completed`
- `finance.customer.updated`
- `finance.subscription.created`
- `finance.subscription.cancelled`
- `finance.report.generated`
- `finance.alert.revenue-drop`
- `finance.alert.refunds-spike`

These should use the shared activity system under `.termlings/store/activity/`.

## Integrations

`finance` should connect naturally to:

- `brief`
  for workspace/business snapshots
- `crm`
  later, for customer and revenue context
- `ads`
  later, for spend vs revenue comparisons
- `requests`
  for credential setup and operator approvals

## Human-in-the-Loop

Finance data is sensitive and high-trust.

Important human-touch surfaces:

- first-time provider connection
- token refresh setup
- reconciliation questions
- export/report review
- alerts that may trigger major business decisions

So `finance` should work well with `requests`, even if approval policies are not part of v1.

## Provider API

Keep provider logic behind a narrow adapter:

```ts
type FinanceProvider = {
  listAccounts(): Promise<FinanceAccount[]>
  syncCustomers(): Promise<FinanceCustomer[]>
  syncSubscriptions(): Promise<FinanceSubscription[]>
  syncInvoices(): Promise<FinanceInvoice[]>
  syncCharges(): Promise<FinanceCharge[]>
  syncRefunds(): Promise<FinanceRefund[]>
}
```

Provider-specific fields can live in `meta`, but the app should normalize the common business model.

## Auth Model

V1 should use `.termlings/.env` for provider credentials, typically added via `termlings request env ... --scope termlings`.

Examples:

```bash
termlings request env STRIPE_API_KEY "Needed for finance sync" --scope termlings
termlings request env POLAR_ACCESS_TOKEN "Needed for finance sync" --scope termlings
```

Later, OAuth-heavy providers can move behind connectors or brokered integrations without changing the finance app’s storage model.

## V1 Boundary

Keep v1 narrow:

- one app: `finance`
- Stripe + Polar first
- sync customer/subscription/invoice/charge/refund state
- local normalized metrics
- simple report generation
- shared activity events

Do not add in v1:

- bank account integration
- tax logic
- accounting exports
- ledger and reconciliation systems
- advanced forecasting models

## Success Criteria

V1 is successful if:

- an operator can inspect core business metrics from one CLI
- Stripe and Polar data can be synced into local files
- MRR and basic subscription metrics are trustworthy from normalized snapshots
- `brief` can consume finance summaries later without custom glue
- finance becomes a clean foundation for future business reporting
