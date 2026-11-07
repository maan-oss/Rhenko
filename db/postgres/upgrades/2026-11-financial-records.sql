-- Upgrade for an existing database: the payment records kept when an account is deleted (lib/payments.ts keepPaymentRecords).
-- Run once against the live database, then restart the app. Safe to run again. Matches the financial_records part of
-- db/postgres/schema.sql.
begin;

create table if not exists financial_records (
  id text primary key,
  source text not null check (source in ('subscription', 'tip', 'advertising')),
  detail text not null,
  amount bigint,
  fee bigint,
  currency text,
  unit text check (unit in ('minor', 'micro')),
  reference text,
  occurred_at bigint not null,
  keep_until bigint not null
);
create index if not exists financial_records_keep_until on financial_records (keep_until);

commit;
