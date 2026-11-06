# End-to-end encrypted chats

Status: built and tested in the working tree; not yet enabled in production. Encrypted chats are turned on by `RHENKO_E2EE=1`. While the flag is off,
new chats are plaintext, as before. The production schema change and the handling of existing plaintext messages are separate steps that need
explicit approval (see "Rollout").

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

Legal review of child-safety reporting under end-to-end encryption is not complete. Nothing in this document or in the privacy page describes how
reports of encrypted content are handled.

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

## Reading, searching, exporting

- Messages are opened on the device by `openSealed`. A message the device has no wrap for shows a notice rather than an error.
- Each device pins the signing key it first sees for another device (IndexedDB store `pins`, keystore version 2). If a later key differs, messages from
  that device are not opened and the thread shows a notice (`KEY_CHANGED` in `lib/e2ee-client.ts`). Pinning is trust on first use by this browser.
  There is no safety-number comparison between devices yet.
- Search in an encrypted chat runs on the device over the rows it has opened (`searchOnDevice`). Export runs on the device too
  (`exportRowsForDevice`, `exportedMessage`). The server's export route returns 409 for a chat with sealed messages.
- The account data download (`app/api/account-data/route.ts`) lists encrypted messages with `encrypted: true` and no text, attachments, or files.
- Reminders and the digest show "Encrypted message" as the preview for sealed messages (`ENCRYPTED_PREVIEW`).

## Known limits

- Linking relies on the user comparing the six-digit code. There is no second check of either device's key.
- If a copy fails after approval, the new device has no history for the chat, and the UI has no retry. Approving again creates a new link.
- The history copy is paged by the cursor. There is no total cap.
- Metadata listed above is visible to the server. Reaction emoji are plaintext.
- Pinning trusts the first key the server gives this browser for each device.

## Tests

- Unit (`npm run test:unit`): `tests/e2ee.test.mjs`, `tests/e2ee-rules.test.mjs`, `tests/e2ee-media.test.mjs`, `tests/e2ee-sealed-kinds.test.mjs`,
  `tests/e2ee-link.test.mjs`, `tests/chat-export-device.test.mjs`.
- End to end: `node e2e/run.mjs` with `ONLY=encrypted` against a server started with `RHENKO_E2EE=1`. It checks what the database stores,
  on-device search and export, and linking a second browser of the same account from the first.

## Rollout

Not performed. Each step needs explicit approval:

1. Apply `db/postgres/upgrades/2026-11-e2ee.sql` to production, after a `pg_dump` backup.
2. Decide what happens to existing plaintext messages, and delete them only after the backup is confirmed.
3. Complete the legal review of child-safety reporting under end-to-end encryption.
4. Decide the appeals flow in `lib/moderation.ts` (`restorePost` and `AppealDecision`).
5. Confirm production does not run pgbouncer in front of Postgres.
6. Turn on `RHENKO_E2EE=1`.
