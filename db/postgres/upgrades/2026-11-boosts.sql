-- Boosts: a campaign can promote one of the author's own posts (post_id). Safe to run twice.
alter table ad_campaigns add column if not exists post_id text;
create index if not exists ad_campaigns_post on ad_campaigns (post_id);
