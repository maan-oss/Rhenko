-- Upgrade for an existing database to end-to-end encryption (lib/e2ee.ts). Run once against the live database, then restart
-- the app. Safe to run again. Matches the new parts of db/postgres/schema.sql.
begin;
alter table chat_messages add column if not exists cipher text;
alter table conversations add column if not exists e2ee bigint not null default 0;
-- End-to-end encryption (lib/e2ee.ts). A device is a browser or app that holds its own private keys; the server keeps only the
-- public halves, listed here. A revoked device gets no further messages, and its old wraps stay as they are.
create table if not exists e2ee_devices (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  agreement_key text not null,
  signing_key text not null,
  label text not null default '',
  created_at bigint not null,
  last_seen_at bigint,
  revoked_at bigint
);
create index if not exists e2ee_devices_user on e2ee_devices (user_id) where revoked_at is null;

-- One row per message and device that can read it: the message's content key, wrapped for that device (see lib/e2ee.ts).
create table if not exists chat_message_wraps (
  message_id text not null references chat_messages(id) on delete cascade,
  device_id text not null references e2ee_devices(id) on delete cascade,
  epk text not null,
  iv text not null,
  key text not null,
  primary key (message_id, device_id)
);

-- A device waiting to be linked to an account. The new device posts its public keys with a short code, and an existing device
-- of the account approves that code. Pending links expire after a few minutes and are removed by the background tick.
create table if not exists e2ee_link_requests (
  code text primary key,
  user_id text not null references users(id) on delete cascade,
  agreement_key text not null,
  signing_key text not null,
  label text not null default '',
  expires_at bigint not null,
  approved_device text references e2ee_devices(id) on delete set null
);

-- The device a link made on approval, so the approving device can copy the account's message keys to it.
alter table e2ee_link_requests add column if not exists device_id text references e2ee_devices(id) on delete cascade;

-- Files waiting to be removed from storage (see db/postgres/schema.sql). The moderation command line queues them here, because
-- it cannot reach R2 itself.
create table if not exists pending_file_deletions (
  name text primary key,
  created_at bigint not null
);

-- Reports of chat messages (see db/postgres/schema.sql, and lib/chat-reports.ts for what they hold). No foreign keys, so a report
-- outlives its chat and its accounts until it is due to be removed.
create table if not exists chat_reports (
  id text primary key,
  reporter_id text not null,
  reported_user_id text not null,
  conversation_id text not null,
  message_id text not null,
  kid text not null,
  reason text not null,
  sealed text not null,
  created_at bigint not null,
  retain_until bigint not null,
  status text not null default 'open',
  opened_at bigint,
  handled_at bigint
);
create index if not exists chat_reports_open on chat_reports (status, created_at);
create index if not exists chat_reports_retain on chat_reports (retain_until);
create unique index if not exists chat_reports_once on chat_reports (reporter_id, message_id);

-- The stored files a report keeps. A file stays in storage while any report keeps it.
create table if not exists chat_report_files (
  report_id text not null references chat_reports(id) on delete cascade,
  file text not null,
  primary key (report_id, file)
);
create index if not exists chat_report_files_file on chat_report_files (file);

-- The NCMEC report number and date, for a report made to NCMEC (see db/postgres/schema.sql).
alter table chat_reports add column if not exists ncmec_reference text;
alter table chat_reports add column if not exists ncmec_reported_at bigint;

-- A chat message taken off the server by a moderator or an urgent report (see db/postgres/schema.sql).
create table if not exists chat_message_removals (
  id text primary key,
  message_id text not null,
  conversation_id text not null,
  sender_id text not null,
  category text not null,
  explanation text not null,
  source text not null,
  created_at bigint not null
);
create index if not exists chat_message_removals_message on chat_message_removals (message_id);
create index if not exists chat_message_removals_created on chat_message_removals (created_at);
commit;
