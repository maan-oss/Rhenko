-- Upgrade for an existing database to age assurance (lib/age-assurance.ts): the result of the Stripe Identity check on each
-- account, the Stripe session it is waiting on, and when the result was recorded. No date of birth, document or photo is stored.
-- Run once against the live database, then restart the app. Safe to run again. Matches the age columns in db/postgres/schema.sql.
begin;

alter table users add column if not exists age_check text not null default 'none';
alter table users drop constraint if exists users_age_check_check;
alter table users add constraint users_age_check_check check (age_check in ('none', 'pending', 'adult', 'not_adult'));
alter table users add column if not exists age_check_session text;
alter table users add column if not exists age_checked_at bigint;

commit;
