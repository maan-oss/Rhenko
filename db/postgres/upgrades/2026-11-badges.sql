-- Badges: the OG badge (the first accounts) and the ID-checked mark a person chooses to show. Safe to run twice.
alter table users add column if not exists og_badge bigint not null default 0;
alter table users add column if not exists show_id_badge bigint not null default 0;

-- The first 1000 accounts by creation time get OG, the same rule as sign-up (OG_LIMIT in lib/badges.ts).
update users set og_badge = 1
  where og_badge = 0 and id in (select id from users order by created_at, id limit 1000);
