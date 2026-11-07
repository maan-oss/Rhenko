-- Upgrade for an existing database to the copyright and intimate-image notice rules (lib/notice-rules.ts, lib/business-days.ts):
-- the telephone number and authority statement a copyright notice needs, the removal deadline on an intimate image notice, and the
-- counter-notice a copyright removal can be answered with (17 U.S.C. 512(g)). Run once against the live database, then restart the
-- app. Safe to run again. Matches the new parts of db/postgres/schema.sql.
begin;
alter table legal_notices add column if not exists phone text not null default '';
alter table legal_notices add column if not exists authorized bigint not null default 0;
alter table legal_notices add column if not exists due_by bigint;
create table if not exists counter_notices (
  id text primary key,
  notice_id text not null unique references moderation_notices(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  address text not null,
  phone text not null,
  signature text not null,
  removed_location text not null,
  created_at bigint not null,
  restore_from bigint not null,
  restore_by bigint not null,
  forwarded_at bigint,
  court_action_at bigint,
  restored_at bigint
);
create index if not exists counter_notices_open on counter_notices (restore_by) where restored_at is null;
commit;
