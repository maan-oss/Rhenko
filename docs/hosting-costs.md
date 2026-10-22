# Hosting costs

What Rhenko costs to run at launch, what each part costs, and what was chosen to keep it cheap without lowering quality.
Prices were checked on 22 October 2026. Anything marked unverified was not confirmed on the provider's own price page.

## Launch setup and monthly cost

| Part | Choice | Monthly cost | Status |
| --- | --- | --- | --- |
| Server: app, Postgres, Caddy, backups | DigitalOcean Standard, 1 vCPU, 2 GB RAM, 50 GB disk | $12 (US list price) | Bangalore price unverified |
| Media storage | Cloudflare R2, bucket `rhenko-media` | $0 up to 10 GB stored, then $0.015 per GB-month | Working: smoke test passed 22 Oct |
| Database backup copies | R2, `db-backups/`, removed after 30 days by the upload job | Cents | Removal runs in the upload job; not yet run against R2 |
| Outbound email | Amazon SES | $0.10 per 1,000 emails | Mumbai rate unverified |
| Bandwidth for media | R2 egress | $0 | Free per Cloudflare's pricing page |
| Domain | Not bought yet | Registration fee only | Needs your decision |
| Australia block | Cloudflare proxy, free plan | $0 | Needs the domain on Cloudflare |

At small volume the total is about $13 a month, plus the domain fee. Email and storage costs rise only with real use.

## Why these choices

- **Server, 2 GB.** It is the smallest plan that fits Postgres, the app workers and Caddy. The bootstrap adds swap. Measure CPU and memory in the first weeks. The next step up is the 2 vCPU, 4 GB plan at $24, and the scaling plan says to measure before adding a server.
- **Not Oracle's free tier.** Its Always Free allowance (2 OCPUs and 12 GB) costs nothing, but Oracle may reclaim an always-free instance that stays under 20% CPU, network and memory use for seven days. A small launch server could fall under that rule, and Oracle's page does not confirm Mumbai as an eligible home region. Too risky for a live service.
- **R2 for media.** Egress is free, so serving photos and video costs no bandwidth. Uploads already go to R2.
- **SES for email.** $0.10 per 1,000 emails. At launch the app sends sign-in codes, password resets and notices, so volume will be low.
- **Cloudflare in front.** It is needed for the Australia block anyway, because the country header comes from it. On the free plan it can also cache static files, which saves server bandwidth.
- **Backups kept as they are.** A dump every six hours, 16 kept locally, copied hourly to R2, and removed after 30 days. Storage costs cents. Cutting the schedule would reduce recovery options and save almost nothing.

## Open items

- Confirm the Bangalore price for the 2 GB plan.
- Confirm the SES price in ap-south-1 (Mumbai).
- The R2 access key cannot change bucket settings (a lifecycle rule returns 403), so the 30-day removal runs in `deploy/upload-backups.sh` instead. Check the first hourly run's log once the server is live.
- Video is the largest future storage cost, with uploads up to 100 MB each. Transcoding would cut it but uses server CPU. Decide after measuring real uploads.

## Sources

- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- SES pricing: https://aws.amazon.com/ses/pricing/
- DigitalOcean Standard plans (US prices, July 2026): https://valebyte.com/en/blog/digitalocean-pricing-overview-and-5-cheaper-alternatives-in-2026/
- Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
