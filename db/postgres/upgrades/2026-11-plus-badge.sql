-- Upgrade for an existing database: Rhenko Plus includes the paid subscriber ring. Before this, only the separate badge subscription
-- (kind 'verified') turned the ring on. This gives the ring to everyone with an active Plus subscription now. After that,
-- lib/payments.ts keeps the column in step with each subscription. Run once against the live database, then restart the app.
-- Safe to run again. Matches db/postgres/schema.sql, which needs no change.
begin;

update users
set paid_verified = 1
where paid_verified = 0
  and id in (select user_id from subscriptions where kind = 'plus' and status in ('active', 'trialing'));

commit;
