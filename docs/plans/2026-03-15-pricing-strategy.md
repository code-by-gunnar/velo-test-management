# Velo Pricing Strategy

## Payment Provider Recommendation

**Primary: Polar.sh** — 4% + $0.40, Merchant of Record (handles all global tax), developer-native, Next.js friendly.

**Backup: Paddle** — 5% + $0.50, more mature MoR, if Polar's B2B subscription edge cases are a concern.

**Why not Stripe:** Best API but you carry legal tax burden globally. Solo founder + tax compliance in 25+ US states + EU VAT = operational nightmare.

| Provider | Fee | Tax Handling | Best For |
|---|---|---|---|
| Polar.sh | 4% + $0.40 | Full (MoR) | Developer tools, lower fees |
| Paddle | 5% + $0.50 | Full (MoR) | Enterprise-grade, global |
| Stripe | 2.9% + $0.30 + extras | DIY (you file returns) | Full control, US-only |
| Lemon Squeezy | 5% + $0.50 + 1.5% intl | Full (MoR) | Digital goods, not B2B SaaS |

## Proposed Tiers

### Free (permanent, no credit card)

| Limit | Value |
|---|---|
| Users | 3 |
| Workspace | 1 |
| Projects | 3 |
| Test cases | 500 |
| Test runs/month | 25 |
| AI imports/month | 10 |
| Evidence storage | 1 GB |
| CI ingestion | JUnit XML only |
| Linear integration | No |
| BDD/GWT format | No |

**Why these limits:** Solo QA or tiny team gets real value. The 25 runs/month limit is the key upgrade trigger — a team running CI daily hits it in under 2 weeks. BDD and Linear excluded because they're the strongest differentiators for the exact buyer who has budget.

### Starter — $18/user/month (annual) / $22 month-to-month

| Feature | Included |
|---|---|
| Projects | Unlimited |
| Test cases | Unlimited |
| Test runs/month | 300 |
| AI imports/month | 100 per workspace |
| Evidence storage | 10 GB |
| Linear integration | Yes (read + create) |
| BDD/GWT format | Yes |
| CSV import/export | Yes |
| Support | Email |

**Why $18:** Undercuts Qase ($20) while offering Linear integration they don't have. 5-person team = $90/month = within the no-approval budget for a startup.

### Pro — $32/user/month (annual) / $39 month-to-month

| Feature | Included |
|---|---|
| Everything in Starter | Yes |
| Test runs | Unlimited |
| AI imports | Unlimited |
| Evidence storage | Unlimited |
| Linear two-way sync | Yes (status sync back) |
| REST API + webhooks | Yes |
| SSO (SAML/OIDC) | Yes |
| Priority support | Yes |
| Audit log | Yes |

**Why $32:** Between Qase Business ($30) and TestRail ($38). Full features for 20-200 employee startups on a growth path. SSO is the gate — companies with 50+ employees require it.

### Enterprise — Custom (contact sales)

Don't build this at launch. Add when a prospect asks for it. Would include: dedicated isolation, custom data residency, SLA, volume discounts, invoice billing.

## Cost Analysis (AI + Storage)

**AI imports:** ~$0.003 per import (Anthropic API). 100 imports/month = $0.30 cost. Even 500/month = $1.50. Bake into tier limits, don't meter.

**R2 storage:** $0.015/GB/month. Heavy user generates 500MB-2GB/month. Cost: $0.01-$0.03/user/month. Apply soft limits, don't charge overages.

**Conclusion:** Both costs are rounding errors at $18-32/user/month. Bundle them.

## Beta → Launch Transition

1. **Now:** Free, no limits. Collect usage data. Instrument which features are used most.
2. **60 days before launch:** Announce pricing. Tell beta users they get "Beta Founder" pricing — 12-month grandfathered discount. Set as explicit coupon in billing system.
3. **Launch day:** Free tier enforces limits. Paid tiers active. Beta users on discounted plan.
4. **12 months post-launch:** Migrate grandfathered users to current pricing with permanent 20% discount as thank-you.

## Upgrade Triggers (build into product)

These are the moments to surface an upgrade prompt (not a hard wall):

1. **3rd user invitation on Free** — "Your team is growing. Free supports 3 users."
2. **25th run in a calendar month** — "You've used your monthly run quota."
3. **Attempting to create a Linear issue from test case on Free** — "Linear integration requires Starter."
4. **Attempting to create a GWT project on Free** — "BDD format requires Starter."
5. **Attempting to access REST API on Starter** — "API access requires Pro."

## Competitive Positioning

| Tool | Price/seat | Velo Advantage |
|---|---|---|
| TestRail | $34-38 | Half the price, AI import, native Linear |
| Qase | $20-24 | $2 cheaper, Linear integration they don't have |
| TestCollab | $29-39 | AI spec-to-test (not just copilot), BDD native |
| Tuskr | $9-15 | More features at slightly higher price point |
| TestDino | $49-99 flat | Per-seat scales better for teams > 5 |

**Landing page headline:** "Full-featured test management with Linear integration, native BDD, and AI import — at half the cost of TestRail."

## Key Numbers

- Median B2B SaaS price: $45/user/month
- ACV sweet spot for highest conversion: $1K-$5K (Velo: 5 seats × $18 = $1,080 ACV)
- Freemium visitor-to-signup: 13%
- Freemium free-to-paid: 2-5%
- Free trial conversion: 15-25%
- Annual billing discount: typically 15-20% vs monthly

## Sources

- SaaStock B2B SaaS Pricing Strategies 2025
- Monetizely SaaS Pricing Benchmark Study 2025
- UserJot Payment Processor Fee Comparison
- TurboStarter Stripe vs Polar vs Lemon Squeezy Analysis
- Polar.sh Feature Documentation
- FirstPageSage SaaS Freemium Conversion Rates 2025
- ProductLed PLG Benchmarks
