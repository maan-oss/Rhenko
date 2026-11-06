# Switch-over to encrypted chats: production runbook

Nothing in this runbook has been run against production. The operator runs each step, in order, after the approval named in
`docs/encrypted-chats.md`. Steps 2 and 5 delete data and cannot be undone.

## Before starting

- [ ] Counsel has given its preservation advice (`docs/legal-operations.md`). The child-safety overview is in the Better project as
      `claude/e2ee-child-safety-legal-overview-2026-11-06.md`. It recommends building a reporting path for chat messages before encrypted
      chats are turned on. Rhenko has no such path yet, so proceeding means accepting that gap.
- [ ] The server runs the commit that contains `db/postgres/upgrades/2026-11-e2ee.sql` and the moderation changes.
- [ ] The commands below run from the repository directory on the server.

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

Expect NOTICE lines and no ERROR. The file only adds tables and columns, and it is safe to run again. Run it before the new code: the
previous code keeps working on the upgraded schema.

## 4. Deploy the new code and restart the app

Deploy the commit the way you deploy today: rebuild the `rhenko` image and recreate the `app` service. Then check
`docker compose logs --tail 100 app` for errors.

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
   within about 15 seconds, and checks each file again before it deletes it, the same way `scripts/moderation.mjs remove` does.

    begin;
    create temp table doomed on commit drop as
      select m.id, m.media_file from chat_messages m join conversations c on c.id = m.conversation_id where c.e2ee = 0;
    insert into pending_file_deletions (name, created_at)
      select distinct d.media_file, (extract(epoch from now()) * 1000)::bigint
      from doomed d
      where d.media_file ~ '^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm|mov)$'
        and not exists (select 1 from chat_messages m2 where m2.media_file = d.media_file and m2.id not in (select id from doomed))
        and not exists (select 1 from post_media p where p.file = d.media_file)
        and not exists (select 1 from posts p where p.media_file = d.media_file)
        and not exists (select 1 from users u where u.avatar_file = d.media_file or u.banner_file = d.media_file)
        and not exists (select 1 from link_previews l where l.image_file = d.media_file)
        and not exists (select 1 from ad_campaigns a where a.picture_file = d.media_file)
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
- Until the chat reporting path is built, a user cannot report a message, encrypted or plaintext.
