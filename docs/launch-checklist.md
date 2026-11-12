# Launch checklist

What the code already does for a live site, and what the operator must still provide. Setting up the server itself (Docker Compose, Caddy, backups) is in the README under "For production". Every setting is described in `.env.example`.

## Blocking until done

- **Photos and videos are refused** in production until a child-safety scanning provider is connected. This is deliberate: `lib/image-scan.ts` refuses every image and video upload while `RHENKO_IMAGE_SCAN` is unset. Text, links and documents work without it. The vendor work is in `docs/image-scan-vendor-brief.md`.
- **Legal review.** The operator says a lawyer has reviewed the legal pages for every country served (12 November 2026). On the production server, set `RHENKO_LEGAL_REVIEWED=1` and rebuild. The lawyer's name, the review date and the list of changes go into `docs/lawyer-review.md`; that record is not in the repository yet. Counsel should check the Sahayak paragraphs in the Terms, which were added on 12 November 2026.
- **Operator details** appear on the Terms, Privacy and copyright pages. Set `RHENKO_OPERATOR_NAME`, `RHENKO_CONTACT_EMAIL`, `RHENKO_OPERATOR_ADDRESS`, `RHENKO_PRIVACY_EMAIL` and the `RHENKO_COPYRIGHT_AGENT_*` values. A missing one is shown as not published.
- **Chat reports** are refused until `RHENKO_REPORT_KEY` is set on the server. The key pair was generated on 12 November 2026. The public half is the `RHENKO_REPORT_KEY` line in the server's `.env`. The private half is kept by the operator on his own computer, outside the repository and off the server. Keep a second copy somewhere he controls. Whoever holds the private key can read every reported message.

## Decisions to make

- **Australia is blocked** (`BLOCKED_COUNTRIES` in `lib/geo-block.ts`, operator decision, 12 November 2026). The block works only when the domain is behind Cloudflare, which supplies the country header. See `docs/legal-operations.md`.
- **End-to-end encrypted chats are on at launch** (operator decision, 12 November 2026). Set `RHENKO_E2EE=1` on the server only after the schema upgrades and the new code are in place (runbook steps 2 to 4a). The operator reports there are no plaintext messages to remove, so step 5 is a check only: run the dry run and confirm it returns no row with `e2ee = 0`. If it returns any, stop before step 5c. Then step 6.
- **Support email** defaults to `info.rhenko@gmail.com` if `RHENKO_SUPPORT_EMAIL` is not set. Set the operator's own address.
- **Currency and payouts** default to AUD and AU (`RHENKO_CURRENCY`, `RHENKO_PAYOUT_COUNTRY`). Tip amounts and the 10% tip fee are also defaults.

## Services to connect

- **Database:** Postgres, with the backup service writing dumps to R2.
- **Storage:** R2 (`RHENKO_R2_*`). Uploads are kept there.
- **Email:** `RHENKO_SMTP_URL` for sign-up and password-reset codes, and the daily digest. Without it, those features say email is not set up.
- **Human check:** Cloudflare Turnstile (`RHENKO_TURNSTILE_*`), or the built-in puzzle if both are left empty.
- **Calls:** `RHENKO_TURN_*` or `RHENKO_ICE_SERVERS`. Without a TURN server, calls fail on some networks.
- **Push notifications:** the three `RHENKO_VAPID_*` keys. Make the pair once and keep it.
- **Payments:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the Plus and Verified price IDs, and `RHENKO_STRIPE_TAX` if Stripe Tax is used.
- **Optional:** translation, GIFs and Sahayak. Each stays off without its key.

## Checked in this pass

- TypeScript type check: passes.
- Lint across the project: passes.
- Unit tests: 456 of 456 pass.
- End-to-end suite: every area passes.
- Production build: passes.
- Production server: starts, serves the main pages, and sends HSTS, a Content-Security-Policy, `X-Frame-Options: DENY` and a referrer policy.
- Compose file: structure validated with placeholder values.
- Country block: `tests/geo-block.test.mjs` passes 5 of 5, including Australia being blocked.
- Legal group after the Terms change: 42 of 42 checks pass.
- Report key pair: the public half in `.env` matches the private key the operator now holds.

## Not checked here

- The Docker image build. The Docker daemon is not running in this environment.
- Live Stripe, email, R2, Turnstile and TURN. They need real credentials.
- The production database. The dry run in runbook step 5 has to be run there.
