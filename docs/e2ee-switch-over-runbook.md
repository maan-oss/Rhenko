# Switch-over to encrypted chats: production runbook

Nothing in this runbook has been run against production. The operator runs each step, in order, after the approval named in
`docs/encrypted-chats.md`. Steps 2 and 5 delete data and cannot be undone.

## Before starting

- [ ] Counsel has given its preservation advice (`docs/legal-operations.md`), and has seen how chat reports are kept and read (step 4a).
      The child-safety overview is in the Better project as `claude/e2ee-child-safety-legal-overview-2026-11-06.md`. It is not legal advice.
- [ ] The server runs the commit that contains `db/postgres/upgrades/2026-11-e2ee.sql`, `db/postgres/upgrades/2026-11-dmca.sql`,
      `db/postgres/upgrades/2026-11-financial-records.sql`, `db/postgres/upgrades/2026-11-age-check.sql`,
      `db/postgres/upgrades/2026-11-plus-badge.sql`, `db/postgres/upgrades/2026-11-badges.sql` and the chat reporting changes.
- [ ] The Stripe dashboard webhook for this server includes the `identity.verification_session.processing`, `.verified`,
      `.requires_input` and `.canceled` events, and Stripe Identity is enabled for the account. Without them, age checks never finish
      and every account stays unable to post (see step 3).
- [ ] The commands below run from the repository directory on the server (the moderation commands need `lib/`, which the app's image does not
      carry, so run them from a checkout with `npm install` done, not inside the container).

## 1. Confirm no pooler runs in front of Postgres (item 5)

    docker compose ps --format '{{.Service}}'

Expect `db`, `app`, `caddy`, `backup` and `backup-upload`. The app connects to `db:5432`, set in `docker-compose.yml`. Also run
`docker ps --format '{{.Names}} {{.Image}}'` and check that no pgbouncer or other pooler is listed. If one is, stop.

## 2. Write a backup and confirm it reached R2 (item 1, first half)

    docker compose exec backup sh /backup.sh once

The output should start with `wrote /backups/rhenko-`. Then check that `docker compose logs --tail 50 backup-upload` shows no failure, and
that the new `rhenko-*.dump` file appears under `db-backups/` in the R2 bucket. The upload runs hourly. Do not continue until the file is in R2.

A dump taken before the switch holds plaintext messages. Local dumps are kept for 16 runs (about four days at six-hourly), and R2 keeps
dumps for 30 days (`BACKUP_KEEP_DAYS`).

## 3. Apply the schema upgrade (item 1, second half)

    docker compose exec -T db psql -U rhenko -d rhenko -v ON_ERROR_STOP=1 < db/postgres/upgrades/2026-11-e2ee.sql
    docker compose exec -T db psql -U rhenko -d rhenko -v ON_ERROR_STOP=1 < db/postgres/upgrades/2026-11-dmca.sql
    docker compose exec -T db psql -U rhenko -d rhenko -v ON_ERROR_STOP=1 < db/postgres/upgrades/2026-11-financial-records.sql
    docker compose exec -T db psql -U rhenko -d rhenko -v ON_ERROR_STOP=1 < db/postgres/upgrades/2026-11-age-check.sql
    docker compose exec -T db psql -U rhenko -d rhenko -v ON_ERROR_STOP=1 < db/postgres/upgrades/2026-11-plus-badge.sql
    docker compose exec -T db psql -U rhenko -d rhenko -v ON_ERROR_STOP=1 < db/postgres/upgrades/2026-11-badges.sql

Expect NOTICE lines and no ERROR. All six files are safe to run again. Run them before the new code: the previous code keeps working
on the upgraded schema. The second file adds the copyright notice fields (telephone, sworn statement, the 24-hour deadline on
intimate-image notices) and the counter-notice table. The third adds the payment records kept when an account is deleted. Account
deletion in the new code writes to that table, so it must exist before the new code runs. The fourth adds the age-check columns
(`age_check`, `age_check_session`, `age_checked_at`) to `users`; every existing account starts at `none`. The fifth sets the Plus badge
(`paid_verified`) on accounts with an active or trialing Plus subscription, and changes nothing else. The sixth adds the OG column
(`og_badge`, set for the first 1,000 accounts by creation time) and the ID-checked switch (`show_id_badge`, off for everyone until the
person turns it on).

Existing accounts are not grandfathered. Until an account completes the Stripe identity check on the settings page, it can read and
follow but cannot post, reply, message or upload media. Tell users before the switch, because the first thing many of them will see is
that refusal.

## 4. Deploy the new code and restart the app

Deploy the commit the way you deploy today: rebuild the `rhenko` image and recreate the `app` service. Then check
`docker compose logs --tail 100 app` for errors.

## 4a. Make the chat report key (once, before step 6). Reports cannot be stored without it.

Chat reports are sealed to a key pair. The server needs only the public half, and the private half must stay off the server.

    npm run moderation -- report-keygen <a file outside the repository>

This prints a line `RHENKO_REPORT_KEY='{...}'`. Put that line in the server's `.env` and recreate the app (`docker compose up -d app`).
Keep the private key file somewhere only the reviewers can reach, with a copy you control. If it is lost, reports sealed to it cannot be
read again. If it is leaked, anyone holding it can read every reported message, so treat it as you would a production secret.
Reporting is refused while `RHENKO_REPORT_KEY` is missing, so a missing key does not store reports in the clear.

Decided by the operator: Maan Ghori holds the private key. Keep one copy offline in a place he controls, and a second copy in another
place he controls. Neither copy goes on the server or into the repository. Before the first real report arrives, check that the key
opens a test report sealed with a throwaway key pair, so a lost or damaged file is found before it matters.

Reviewing a report (from the repository checkout, with `DATABASE_URL` and the app's storage settings in `.env`):

    npm run moderation -- reports
    npm run moderation -- report-open <reportId> --key <private key file> [--out <folder>]
    npm run moderation -- report-close <reportId> actioned|no-action

`report-open` records when the report was first opened. `--out` saves the report and its files, decrypted, into the folder; keep that folder
as restricted as the report. A report and its files are removed one year after they were made, by the running app.

## 5. Delete existing plaintext messages (item 2). Irreversible.

Run this only after step 2 is confirmed and counsel's preservation advice is in hand.

a. Dry run. This only reads. Plaintext messages are those in conversations with `e2ee = 0`.

    select c.e2ee, count(*) as messages, count(m.media_file) as with_file
    from chat_messages m join conversations c on c.id = m.conversation_id
    group by c.e2ee;

b. Check for attachments that are not stored as a file. If this count is not zero, stop and read `lib/message-attachments.ts` before
   deleting, because those attachments need a plan of their own.

    select count(*) from chat_messages m join conversations c on c.id = m.conversation_id
    where c.e2ee = 0 and m.attachment is not null and m.media_file is null;

c. Delete the messages and queue the files that nothing else uses, in one transaction. The running app removes queued files from storage
   within about 15 seconds, and checks each file again before it deletes it, the same way `scripts/moderation.mjs remove` does. The name pattern is every upload type the
   app accepts (lib/uploads.ts), so a voice note or a document is queued too, and the last check keeps a file that a chat report still
   holds. `tests/upload-names.test.mjs` keeps the pattern in step with the app; change them together.

    begin;
    create temp table doomed on commit drop as
      select m.id, m.media_file from chat_messages m join conversations c on c.id = m.conversation_id where c.e2ee = 0;
    insert into pending_file_deletions (name, created_at)
      select distinct d.media_file, (extract(epoch from now()) * 1000)::bigint
      from doomed d
      where d.media_file ~ '^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm|mov|weba|m4a|oga|mp3|wav|pdf|txt|csv|docx|xlsx|pptx|zip|sealed)$'
        and not exists (select 1 from chat_messages m2 where m2.media_file = d.media_file and m2.id not in (select id from doomed))
        and not exists (select 1 from post_media p where p.file = d.media_file)
        and not exists (select 1 from posts p where p.media_file = d.media_file)
        and not exists (select 1 from users u where u.avatar_file = d.media_file or u.banner_file = d.media_file)
        and not exists (select 1 from link_previews l where l.image_file = d.media_file)
        and not exists (select 1 from ad_campaigns a where a.picture_file = d.media_file)
        and not exists (select 1 from chat_report_files f where f.file = d.media_file)
      on conflict (name) do nothing;
    delete from chat_messages where id in (select id from doomed);
    select count(*) as deleted from doomed;
    commit;

   Check that `deleted` matches the dry-run count for `e2ee = 0`. If it does not, the transaction has not been committed, so run
   `rollback;` if the session is still open.

d. Check the result. The first count should be 0, and the queue should empty within about a minute.

    select count(*) from chat_messages m join conversations c on c.id = m.conversation_id where c.e2ee = 0;
    select count(*) from pending_file_deletions;

## 6. Turn on encrypted chats (item 6)

Set `RHENKO_E2EE=1` in the server's `.env`, then recreate the app so it reads the new value: `docker compose up -d app`.
Check the logs, then open Settings, Privacy, and confirm that the encrypted chats section appears. A chat created now is encrypted.

## After the switch

- Dumps from before the switch still hold the messages that step 5 deleted: local dumps for about four days, R2 dumps for 30 days, and
  the step 2 dump until someone deletes it. How long to keep them is a decision for you and counsel, and deleting R2 objects is a step
  you take yourself.
- Going back to plaintext means restoring the step 2 dump, which loses everything sent after it. Chats that are already encrypted stay
  encrypted (`conversations.e2ee` never goes back to 0).
- A chat report and its files are kept for one year, even after the chat or the sender's account is deleted. Deleting one early is not
  a button in the app; it needs a decision by you and counsel, and a change to `lib/chat-report-store.ts`.
- A report of a chat that is not encrypted is sealed by the server from the stored messages. A report of an encrypted chat is sealed on the
  reporter's device. Both open the same way.
