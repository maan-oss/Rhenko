# End-to-end encrypted chats

Status: built, tested and committed; not yet enabled in production. Encrypted chats are turned on by `RHENKO_E2EE=1`. While the flag is off,
new chats are plaintext, as before. The production schema change, the deletion of existing plaintext messages and the flag itself are separate
steps that need explicit approval. They are listed under "Rollout", and the production steps are in `docs/e2ee-switch-over-runbook.md`.

## What is encrypted

A direct or group chat created while `RHENKO_E2EE=1` is encrypted. For each message:

- The payload (text, attachments, locations, contacts, poll questions and options) is serialized on the sender's device and sealed with a fresh
  AES-GCM-256 content key.
- The content key is wrapped separately for each active device of every member, using ECDH P-256 and HKDF. The wrap is stored in
  `chat_message_wraps` (one row per message and device).
- The envelope is signed with the sender device's ECDSA P-256 key. The signature covers the context
  `contextOf(conversationId, messageId, senderDevice)`, so a ciphertext cannot be moved to another chat, message, or sender.
- Files are encrypted with a random AES key per file. The key travels inside the sealed message.

The server stores the envelope in `chat_messages.cipher` and leaves `body` empty for sealed messages. `checkEncryptedSend` (`lib/e2ee.ts`) refuses a send
unless it includes one wrap for every active device of every member.

## What the server can see

Metadata is visible by design: membership, timestamps (send, edit), message ids, reply, pin, star and reaction relations, reaction emoji (sent in
plaintext), poll option ids and votes, ciphertext size, the forwarded flag, `edited_at`, and the userId of a shared contact when it resolves to a
Rhenko account. Video is refused in encrypted chats.

Reporting: anyone in a chat can report a message from another person, through the message's menu (Report). It works the way WhatsApp's does:
the reported message and up to four before it go to Rhenko for review, and nobody else in the chat is told. In an encrypted chat the
reporter's device seals the report from the messages it has opened (`lib/chat-report-client.ts`); in a chat that is not encrypted the server
seals it from the stored messages (`actions/chat-reports.ts`). Either way the report is sealed to the report key (`lib/chat-reports.ts`,
`RHENKO_REPORT_KEY`, the public half only), so the server stores ciphertext in `chat_reports.sealed`. Files the report includes are kept in
`chat_report_files`, so they stay in storage with the report. A report and its files are kept for one year and then removed by the running app
(`purgeExpiredChatReports`). The private key is a file the operator keeps outside the server. `scripts/moderation.mjs report-open` is the only way
to read a report. This is built and tested; it is not yet reviewed by counsel (see the child-safety overview in the Better project,
`claude/e2ee-child-safety-legal-overview-2026-11-06.md`, which is not legal advice).

## Devices

Each browser that reads encrypted chats has a device. The private keys are non-extractable `CryptoKey` objects in IndexedDB
(`lib/e2ee-keystore.ts`). The device id is in an httpOnly cookie, `rhenko_device`. An account may have up to `MAX_DEVICES_PER_USER` (10) active devices.

The first device of an account is created when the app opens. When the account already has devices, a new browser cannot create its own device.
It must be linked:

1. The new browser asks for a link. The server creates a pending link with a six-digit code (`lib/e2ee-link.ts`). The code expires after
   `LINK_WAIT_MS` (5 minutes).
2. The user checks that the code matches and approves the link on a device they are signed in on (Settings, Devices and encryption). Approval
   creates the new device row immediately and records the approver and the new device.
3. The approving device copies history. For each stored wrap it unwraps the content key with its own private key and re-wraps it for the new device
   (`rewrapFor` in `lib/e2ee.ts`), then stores the copies in batches of up to `HISTORY_BATCH_MAX` (200), paging by message id. The approved link
   stays open for `LINK_COPY_MS` (10 minutes), which is longer than the waiting window so a copy can finish.

`setUpThisDevice` only replaces a device when the cookie's device is the account's only active device. Signing out clears the keys from the browser,
so signing in again on the same browser needs a link when the account has other devices.

## Safety numbers

Contact info in an encrypted chat (Chat options, then Contact info) shows a safety number for each other accepted member of the chat.
Each number is 60 digits. `safetyNumber` in `lib/e2ee.ts` computes it from the signing and agreement keys of every active device of the
two people, sorted so that both sides get the same value. `safetyNumbersFor` in `actions/e2ee.ts` returns the numbers only to an accepted
member of that chat. A member who has no device yet, or whose devices are all deactivated, has no number, and the dialog says why.

A number changes when a browser is linked or removed, so a change is the signal to compare again. The server works from public keys only.
Comparing the numbers is up to the two people, in person or over another channel. The app does not check them.

## Reading, searching, exporting

- Messages are opened on the device by `openSealed`. A message the device has no wrap for shows a notice rather than an error.
- Each device pins the signing key it first sees for another device (IndexedDB store `pins`, keystore version 2). If a later key differs, messages from
  that device are not opened and the thread shows a notice (`KEY_CHANGED` in `lib/e2ee-client.ts`). Pinning is trust on first use by this browser.
  Safety numbers, which let two people compare their keys, are under Contact info (see Safety numbers below).
- Search in an encrypted chat runs on the device over the rows it has opened (`searchOnDevice`). Export runs on the device too
  (`exportRowsForDevice`, `exportedMessage`). The server's export route returns 409 for a chat with sealed messages.
- The account data download (`app/api/account-data/route.ts`) lists encrypted messages with `encrypted: true` and no text, attachments, or files.
- Reminders and the digest show "Encrypted message" as the preview for sealed messages (`ENCRYPTED_PREVIEW`).

## Known limits

- Linking relies on the user comparing the six-digit code. There is no second check of either device's key.
- If a copy stops partway, the new device has only part of the history. Settings, Devices and encryption shows History copies with Copy again
  until the copy window closes (`LINK_COPY_MS`). Copying again only adds what is still missing. Messages the approving device cannot open
  are counted as skipped, and they cannot be copied from that device.
- The history copy is paged by the cursor. There is no total cap.
- Metadata listed above is visible to the server. Reaction emoji are plaintext.
- Pinning trusts the first key the server gives this browser for each device.

## Tests

- Unit (`npm run test:unit`): `tests/e2ee.test.mjs`, `tests/e2ee-rules.test.mjs`, `tests/e2ee-media.test.mjs`, `tests/e2ee-sealed-kinds.test.mjs`,
  `tests/e2ee-link.test.mjs`, `tests/chat-export-device.test.mjs`, `tests/chat-reports.test.mjs`.
- End to end: `node e2e/run.mjs` with `ONLY=encrypted` against a server started with `RHENKO_E2EE=1` and `RHENKO_REPORT_KEY`. It checks what the
  database stores, on-device search and export, linking a second browser of the same account from the first, and reporting a message (the stored
  report is sealed and holds none of its words). `ONLY=messages` checks reporting in a chat that is not encrypted.

## Rollout

Not performed. The production steps, and what each one deletes, are in `docs/e2ee-switch-over-runbook.md`. Each step needs explicit approval:

1. Apply `db/postgres/upgrades/2026-11-e2ee.sql` to production, after a `pg_dump` backup (runbook steps 2 and 3).
2. Delete existing plaintext messages, only after the backup is confirmed in R2 and counsel has given its preservation advice (runbook step 5).
3. Chat reporting is built (see "What the server can see"). Counsel has not yet approved how reports are kept and read, so get that approval
   before the switch. Create the report key first (runbook step 4a).
4. The appeals flow is decided and built. `scripts/moderation.mjs` `restore` and `decide` are the only way to put a post back or decide an appeal.
   `restorePost` and `AppealDecision` are removed from `lib/moderation.ts`.
5. Confirm production does not run pgbouncer in front of Postgres (runbook step 1).
6. Turn on `RHENKO_E2EE=1` (runbook step 6).
