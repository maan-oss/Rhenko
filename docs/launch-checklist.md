# Launch checklist

What the code already does for a live site, and what the operator must still provide. Setting up the server itself (Docker Compose, Caddy, backups) is in the README under "For production". Every setting is described in `.env.example`.

## Blocking until done

- **Photos and videos are refused** in production until a child-safety scanning provider is connected. This is deliberate: `lib/image-scan.ts` refuses every image and video upload while `RHENKO_IMAGE_SCAN` is unset. Text, links and documents work without it. The vendor work is in `docs/image-scan-vendor-brief.md`.
- **Legal pages show a draft notice** until a lawyer has reviewed them for every country served. Then set `RHENKO_LEGAL_REVIEWED=1` and rebuild. See `docs/lawyer-review.md`. The text has been checked against the code, but that is not legal review.
- **Operator details** appear on the Terms, Privacy and copyright pages. Set `RHENKO_OPERATOR_NAME`, `RHENKO_CONTACT_EMAIL`, `RHENKO_OPERATOR_ADDRESS`, `RHENKO_PRIVACY_EMAIL` and the `RHENKO_COPYRIGHT_AGENT_*` values. A missing one is shown as not published.
- **Chat reports** are refused until `RHENKO_REPORT_KEY` is set. Run `node scripts/moderation.mjs report-keygen <file>` on a machine you control. Put the printed public line in `.env`. Keep the private key file outside the repository and off the server: whoever holds it can read every reported message.

## Decisions to make

- **End-to-end encrypted chats** stay off (`RHENKO_E2EE` unset) until the steps in `docs/e2ee-switch-over-runbook.md` are approved. The privacy page says encryption applies only to chats started while the switch is on.
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

## Not checked here

- The Docker image build. The Docker daemon is not running in this environment.
- Live Stripe, email, R2, Turnstile and TURN. They need real credentials.
