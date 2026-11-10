-- Upgrade for an existing database to reorderable Home tabs (lib/timelines.ts): pinned lists get a position, and a followed
-- topic can be pinned as a Home tab too. Existing pins keep their order, by when they were pinned. Run once against the live
-- database, then restart the app. Safe to run again. Matches timeline_pins and topic_tab_pins in db/postgres/schema.sql.
begin;

alter table timeline_pins add column if not exists position bigint not null default 0;

-- Number the pins that have no position yet, oldest first. A pin that already has one keeps it.
update timeline_pins p
   set position = r.rn
  from (
    select user_id, list_id, row_number() over (partition by user_id order by created_at, list_id) as rn
      from timeline_pins
  ) r
 where p.user_id = r.user_id and p.list_id = r.list_id and p.position = 0;

create table if not exists topic_tab_pins (
    user_id text not null references users (id) on delete cascade,
    tag text not null,
    created_at bigint not null,
    position bigint not null default 0,
    primary key (user_id, tag)
);

commit;
