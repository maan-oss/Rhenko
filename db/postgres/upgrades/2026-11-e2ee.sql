-- Upgrade for an existing database to end-to-end encryption (lib/e2ee.ts). Run once against the live database, then restart
-- the app. Safe to run again. Matches the new parts of db/postgres/schema.sql.
begin;
alter table chat_messages add column if not exists cipher text;
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

-- Message history copied from an existing device to a newly linked one. The body is encrypted to the new device's key, so the
-- server holds it as ciphertext and removes it once the new device has taken it or after it expires.
create table if not exists e2ee_history_transfers (
  id text primary key,
  device_id text not null references e2ee_devices(id) on delete cascade,
  payload text not null,
  created_at bigint not null
);
commit;
