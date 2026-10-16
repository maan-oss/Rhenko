import { DatabaseSync, type StatementSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"

export const DATA_DIR = process.env.RHENKO_DATA_DIR ?? path.join(process.cwd(), "data")
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads")

// Migrations are applied in order. PRAGMA user_version records how many have
// run, so a database created by an earlier build upgrades in place. Never edit
// a migration that has shipped; add a new one instead.
const MIGRATIONS: string[] = [
  // 1. Original schema.
  `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  avatar_file TEXT,
  banner_file TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  reply_to_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  quote_of_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  media_file TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id, created_at);
CREATE INDEX IF NOT EXISTS posts_reply ON posts(reply_to_id);
CREATE INDEX IF NOT EXISTS posts_quote ON posts(quote_of_id);
CREATE TABLE IF NOT EXISTS likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS likes_user ON likes(user_id, created_at);
CREATE TABLE IF NOT EXISTS reposts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS reposts_post ON reposts(post_id);
CREATE INDEX IF NOT EXISTS reposts_user ON reposts(user_id, created_at);
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee ON follows(followee_id);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(recipient_id, created_at);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_sender ON messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS messages_recipient ON messages(recipient_id, sender_id, created_at);
`,

  // 2. Media, polls, views, profile and account features.
  `
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS community_members (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_members_user ON community_members(user_id);

ALTER TABLE users ADD COLUMN birthday TEXT;
ALTER TABLE users ADD COLUMN protected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pinned_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN deactivated_at INTEGER;

ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;

ALTER TABLE posts ADD COLUMN reply_setting TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE posts ADD COLUMN sensitive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN edited_at INTEGER;
ALTER TABLE posts ADD COLUMN publish_at INTEGER;
ALTER TABLE posts ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN community_id TEXT REFERENCES communities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS posts_pending ON posts(author_id, is_draft, publish_at);
CREATE INDEX IF NOT EXISTS posts_community ON posts(community_id, created_at);

CREATE TABLE IF NOT EXISTS post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'image',
  alt TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS post_media_post ON post_media(post_id, position);
INSERT INTO post_media (id, post_id, file, kind, alt, position)
  SELECT lower(hex(randomblob(16))), id, media_file, 'image', '', 0 FROM posts WHERE media_file IS NOT NULL;

CREATE TABLE IF NOT EXISTS polls (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  ends_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS poll_options_post ON poll_options(post_id, position);
CREATE TABLE IF NOT EXISTS poll_votes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS post_views (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, viewer_id)
);
CREATE TABLE IF NOT EXISTS highlights (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS bookmark_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
ALTER TABLE bookmarks ADD COLUMN folder_id TEXT REFERENCES bookmark_folders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS follow_requests (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (requester_id, target_id)
);
CREATE INDEX IF NOT EXISTS follow_requests_target ON follow_requests(target_id);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked ON blocks(blocked_id);
CREATE TABLE IF NOT EXISTS mutes (
  muter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (muter_id, muted_id)
);
CREATE TABLE IF NOT EXISTS muted_words (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, word)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS topic_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, tag)
);
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  private INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS list_members (
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (list_id, user_id)
);
CREATE TABLE IF NOT EXISTS list_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id)
);
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, kind)
);
CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS recovery_codes_user ON recovery_codes(user_id);
CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`,

  // 3. Direct messages become conversations with members, reactions and
  // group support. Existing one-to-one messages move over intact.
  `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'dm',
  title TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted',
  last_read_at INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user ON conversation_members(user_id);
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  media_file TEXT,
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation ON chat_messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

WITH pairs AS (
  SELECT CASE WHEN sender_id < recipient_id THEN sender_id ELSE recipient_id END AS a,
         CASE WHEN sender_id < recipient_id THEN recipient_id ELSE sender_id END AS b,
         MIN(created_at) AS first_at,
         MAX(created_at) AS last_at
  FROM messages
  GROUP BY a, b
)
INSERT INTO conversations (id, kind, title, created_by, created_at, updated_at)
  SELECT 'dm:' || a || ':' || b, 'dm', '', a, first_at, last_at FROM pairs;

INSERT INTO conversation_members (conversation_id, user_id, status, last_read_at, joined_at)
  SELECT conv, uid, 'accepted', 0, MIN(at) FROM (
    SELECT 'dm:' || CASE WHEN sender_id < recipient_id THEN sender_id || ':' || recipient_id ELSE recipient_id || ':' || sender_id END AS conv,
           sender_id AS uid, created_at AS at FROM messages
    UNION ALL
    SELECT 'dm:' || CASE WHEN sender_id < recipient_id THEN sender_id || ':' || recipient_id ELSE recipient_id || ':' || sender_id END AS conv,
           recipient_id AS uid, created_at AS at FROM messages
  ) GROUP BY conv, uid;

UPDATE conversation_members SET last_read_at = (
  SELECT COALESCE(MAX(x.read_at), 0) FROM messages x
  WHERE x.recipient_id = conversation_members.user_id
    AND x.sender_id IN (
      SELECT cm2.user_id FROM conversation_members cm2
      WHERE cm2.conversation_id = conversation_members.conversation_id
        AND cm2.user_id <> conversation_members.user_id
    )
);

INSERT INTO chat_messages (id, conversation_id, sender_id, body, created_at)
  SELECT m.id,
    'dm:' || CASE WHEN m.sender_id < m.recipient_id THEN m.sender_id || ':' || m.recipient_id ELSE m.recipient_id || ':' || m.sender_id END,
    m.sender_id, m.body, m.created_at
  FROM messages m;

DROP TABLE IF EXISTS messages;
`,

  // 4. Hidden replies, edit history, post notifications, community notes,
  // recent searches and profile visits.
  `
ALTER TABLE posts ADD COLUMN hidden_by_parent INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS post_edits (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS post_edits_post ON post_edits(post_id, created_at);

CREATE TABLE IF NOT EXISTS post_subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, author_id)
);
CREATE INDEX IF NOT EXISTS post_subscriptions_author ON post_subscriptions(author_id);

CREATE TABLE IF NOT EXISTS community_notes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_notes_post ON community_notes(post_id);
CREATE TABLE IF NOT EXISTS community_note_ratings (
  note_id TEXT NOT NULL REFERENCES community_notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helpful INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, user_id)
);

CREATE TABLE IF NOT EXISTS recent_searches (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, query)
);
CREATE INDEX IF NOT EXISTS recent_searches_user ON recent_searches(user_id, created_at);

CREATE TABLE IF NOT EXISTS profile_visits (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS profile_visits_profile ON profile_visits(profile_id, created_at);
`,

  // 5. Mentions from verified accounts only, and muted conversations.
  `
ALTER TABLE users ADD COLUMN mentions_verified_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_members ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;
`,

  // 6. A short status shown beside the account, like a status line in chat apps.
  `
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT '';
`,

  // 7. Calls leave a record in the thread: missed, declined, or how long a call lasted.
  `
ALTER TABLE chat_messages ADD COLUMN call_status TEXT;
ALTER TABLE chat_messages ADD COLUMN call_seconds INTEGER NOT NULL DEFAULT 0;
`,

  // 8. Email for password recovery and verification, poll durations and end notices,
  // report review, and how many people took part in a call.
  `
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  target TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_codes_user ON email_codes(user_id, purpose);

ALTER TABLE polls ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE polls ADD COLUMN notified_at INTEGER;
ALTER TABLE reports ADD COLUMN resolved_at INTEGER;
ALTER TABLE chat_messages ADD COLUMN call_kind TEXT NOT NULL DEFAULT 'dm';
ALTER TABLE chat_messages ADD COLUMN call_people INTEGER NOT NULL DEFAULT 2;
`,
  // 9. Who has left a direct conversation, so the other person still sees a name there after a declined request.
  `
CREATE TABLE IF NOT EXISTS conversation_departures (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  left_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
`,
  // 10. Legal and safety: the terms each account accepted, posts hidden by moderation with a notice and an appeal, the
  // outcome of each report, the notices people send about content, and saved searches.
  `
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
ALTER TABLE posts ADD COLUMN removed_at INTEGER;
CREATE INDEX IF NOT EXISTS posts_removed ON posts(removed_at) WHERE removed_at IS NOT NULL;
ALTER TABLE reports ADD COLUMN outcome TEXT;
ALTER TABLE reports ADD COLUMN outcome_at INTEGER;

CREATE TABLE IF NOT EXISTS moderation_notices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  category TEXT NOT NULL,
  explanation TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  appeal_until INTEGER NOT NULL,
  restored_at INTEGER
);
CREATE INDEX IF NOT EXISTS moderation_notices_user ON moderation_notices(user_id, created_at);
CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL UNIQUE REFERENCES moderation_notices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decision TEXT,
  decision_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS legal_notices (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  post_id TEXT,
  work TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  good_faith INTEGER NOT NULL DEFAULT 0,
  accurate INTEGER NOT NULL DEFAULT 0,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  decision_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS legal_notices_open ON legal_notices(status, created_at);
CREATE TABLE IF NOT EXISTS saved_searches (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, query)
);
`,

  // 11. Speed. Engagement counts are kept on the post by triggers, so a feed reads a number instead of counting rows
  // for every post on every page. Search uses a trigram index over the body (substring matches, like the LIKE it
  // replaces). Scheduled posts have an index, so the publish check stops scanning every post.
  //
  // The search index is keyed on search_id, not on rowid: VACUUM INTO (used by the backup script) renumbers rowids
  // but keeps explicit columns, so a backup restored with its index still matches.
  `
ALTER TABLE posts ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN reposts_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN replies_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN quotes_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN views_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN engagement INTEGER GENERATED ALWAYS AS (likes_count + 2 * reposts_count + replies_count) VIRTUAL;
ALTER TABLE posts ADD COLUMN search_id INTEGER;
UPDATE posts SET
  likes_count = (SELECT COUNT(*) FROM likes l WHERE l.post_id = posts.id),
  reposts_count = (SELECT COUNT(*) FROM reposts r WHERE r.post_id = posts.id),
  replies_count = (SELECT COUNT(*) FROM posts c WHERE c.reply_to_id = posts.id AND c.is_draft = 0 AND c.publish_at IS NULL),
  quotes_count = (SELECT COUNT(*) FROM posts q WHERE q.quote_of_id = posts.id AND q.is_draft = 0 AND q.publish_at IS NULL),
  views_count = (SELECT COUNT(*) FROM post_views v WHERE v.post_id = posts.id AND v.viewer_id <> posts.author_id),
  search_id = rowid;
CREATE UNIQUE INDEX IF NOT EXISTS posts_search_id ON posts(search_id);
CREATE INDEX IF NOT EXISTS posts_engagement ON posts(engagement DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_scheduled ON posts(publish_at) WHERE publish_at IS NOT NULL;
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(body, tokenize = 'trigram');
INSERT INTO posts_fts (rowid, body) SELECT search_id, body FROM posts;

CREATE TRIGGER likes_count_insert AFTER INSERT ON likes BEGIN
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
END;
CREATE TRIGGER likes_count_delete AFTER DELETE ON likes BEGIN
  UPDATE posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
END;
CREATE TRIGGER reposts_count_insert AFTER INSERT ON reposts BEGIN
  UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
END;
CREATE TRIGGER reposts_count_delete AFTER DELETE ON reposts BEGIN
  UPDATE posts SET reposts_count = reposts_count - 1 WHERE id = OLD.post_id;
END;
CREATE TRIGGER views_count_insert AFTER INSERT ON post_views BEGIN
  UPDATE posts SET views_count = views_count + 1 WHERE id = NEW.post_id AND author_id <> NEW.viewer_id;
END;
CREATE TRIGGER views_count_delete AFTER DELETE ON post_views BEGIN
  UPDATE posts SET views_count = views_count - 1 WHERE id = OLD.post_id AND author_id <> OLD.viewer_id;
END;
-- Replies and quotes count once they are live: not drafts, not scheduled.
CREATE TRIGGER posts_replies_insert AFTER INSERT ON posts WHEN NEW.is_draft = 0 AND NEW.publish_at IS NULL BEGIN
  UPDATE posts SET replies_count = replies_count + 1 WHERE id = NEW.reply_to_id;
  UPDATE posts SET quotes_count = quotes_count + 1 WHERE id = NEW.quote_of_id;
END;
CREATE TRIGGER posts_replies_delete AFTER DELETE ON posts WHEN OLD.is_draft = 0 AND OLD.publish_at IS NULL BEGIN
  UPDATE posts SET replies_count = replies_count - 1 WHERE id = OLD.reply_to_id;
  UPDATE posts SET quotes_count = quotes_count - 1 WHERE id = OLD.quote_of_id;
END;
CREATE TRIGGER posts_replies_live AFTER UPDATE OF is_draft, publish_at ON posts
WHEN (OLD.is_draft = 0 AND OLD.publish_at IS NULL) <> (NEW.is_draft = 0 AND NEW.publish_at IS NULL) BEGIN
  UPDATE posts SET replies_count = replies_count + (CASE WHEN NEW.is_draft = 0 AND NEW.publish_at IS NULL THEN 1 ELSE -1 END) WHERE id = NEW.reply_to_id;
  UPDATE posts SET quotes_count = quotes_count + (CASE WHEN NEW.is_draft = 0 AND NEW.publish_at IS NULL THEN 1 ELSE -1 END) WHERE id = NEW.quote_of_id;
END;
CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
  UPDATE posts SET search_id = (SELECT COALESCE(MAX(search_id), 0) + 1 FROM posts) WHERE rowid = NEW.rowid AND search_id IS NULL;
  INSERT INTO posts_fts (rowid, body) SELECT search_id, body FROM posts WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER posts_search_body AFTER UPDATE OF body ON posts BEGIN
  UPDATE posts_fts SET body = NEW.body WHERE rowid = NEW.search_id;
END;
CREATE TRIGGER posts_search_delete AFTER DELETE ON posts BEGIN
  DELETE FROM posts_fts WHERE rowid = OLD.search_id;
END;
`,

  // 12. The reposts timeline reads reposts in time order. Without this index it had to sort every repost.
  `
CREATE INDEX IF NOT EXISTS reposts_created ON reposts(created_at);
`,

  // 13. Account counts (followers, following, posts) are kept on the user, by triggers, so a profile, a suggestion and
  // the people lists read a number instead of counting rows. Unread notifications and ending polls have partial indexes:
  // they only hold the rows that are still open.
  `
ALTER TABLE users ADD COLUMN followers_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN following_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN posts_count INTEGER NOT NULL DEFAULT 0;
UPDATE users SET
  followers_count = (SELECT COUNT(*) FROM follows f WHERE f.followee_id = users.id),
  following_count = (SELECT COUNT(*) FROM follows f WHERE f.follower_id = users.id),
  posts_count = (SELECT COUNT(*) FROM posts p WHERE p.author_id = users.id AND p.reply_to_id IS NULL AND p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL);
CREATE INDEX IF NOT EXISTS users_followers ON users(followers_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(recipient_id) WHERE read = 0;
CREATE INDEX IF NOT EXISTS polls_ending ON polls(ends_at) WHERE notified_at IS NULL;

CREATE TRIGGER follows_counts_insert AFTER INSERT ON follows BEGIN
  UPDATE users SET followers_count = followers_count + 1 WHERE id = NEW.followee_id;
  UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
END;
CREATE TRIGGER follows_counts_delete AFTER DELETE ON follows BEGIN
  UPDATE users SET followers_count = followers_count - 1 WHERE id = OLD.followee_id;
  UPDATE users SET following_count = following_count - 1 WHERE id = OLD.follower_id;
END;
CREATE TRIGGER posts_authored_insert AFTER INSERT ON posts
WHEN NEW.reply_to_id IS NULL AND NEW.is_draft = 0 AND NEW.publish_at IS NULL AND NEW.removed_at IS NULL BEGIN
  UPDATE users SET posts_count = posts_count + 1 WHERE id = NEW.author_id;
END;
CREATE TRIGGER posts_authored_delete AFTER DELETE ON posts
WHEN OLD.reply_to_id IS NULL AND OLD.is_draft = 0 AND OLD.publish_at IS NULL AND OLD.removed_at IS NULL BEGIN
  UPDATE users SET posts_count = posts_count - 1 WHERE id = OLD.author_id;
END;
CREATE TRIGGER posts_authored_state AFTER UPDATE OF is_draft, publish_at, removed_at, reply_to_id ON posts
WHEN (OLD.reply_to_id IS NULL AND OLD.is_draft = 0 AND OLD.publish_at IS NULL AND OLD.removed_at IS NULL)
  <> (NEW.reply_to_id IS NULL AND NEW.is_draft = 0 AND NEW.publish_at IS NULL AND NEW.removed_at IS NULL) BEGIN
  UPDATE users SET posts_count = posts_count + (CASE WHEN NEW.reply_to_id IS NULL AND NEW.is_draft = 0 AND NEW.publish_at IS NULL AND NEW.removed_at IS NULL THEN 1 ELSE -1 END)
    WHERE id = NEW.author_id;
END;
`,
  // Threads: a post that continues the author's own thread is part of the feed and the post count, the same as a
  // post that starts one. It carries the id of the thread's first post, so the feed and profile read it directly.
  `
ALTER TABLE posts ADD COLUMN thread_id TEXT REFERENCES posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS posts_thread ON posts(thread_id) WHERE thread_id IS NOT NULL;
DROP TRIGGER posts_authored_insert;
CREATE TRIGGER posts_authored_insert AFTER INSERT ON posts
WHEN (NEW.reply_to_id IS NULL OR NEW.thread_id IS NOT NULL) AND NEW.is_draft = 0 AND NEW.publish_at IS NULL AND NEW.removed_at IS NULL BEGIN
  UPDATE users SET posts_count = posts_count + 1 WHERE id = NEW.author_id;
END;
DROP TRIGGER posts_authored_delete;
CREATE TRIGGER posts_authored_delete AFTER DELETE ON posts
WHEN (OLD.reply_to_id IS NULL OR OLD.thread_id IS NOT NULL) AND OLD.is_draft = 0 AND OLD.publish_at IS NULL AND OLD.removed_at IS NULL BEGIN
  UPDATE users SET posts_count = posts_count - 1 WHERE id = OLD.author_id;
END;
DROP TRIGGER posts_authored_state;
CREATE TRIGGER posts_authored_state AFTER UPDATE OF is_draft, publish_at, removed_at, reply_to_id, thread_id ON posts
WHEN ((OLD.reply_to_id IS NULL OR OLD.thread_id IS NOT NULL) AND OLD.is_draft = 0 AND OLD.publish_at IS NULL AND OLD.removed_at IS NULL)
  <> ((NEW.reply_to_id IS NULL OR NEW.thread_id IS NOT NULL) AND NEW.is_draft = 0 AND NEW.publish_at IS NULL AND NEW.removed_at IS NULL) BEGIN
  UPDATE users SET posts_count = posts_count + (CASE WHEN (NEW.reply_to_id IS NULL OR NEW.thread_id IS NOT NULL) AND NEW.is_draft = 0 AND NEW.publish_at IS NULL AND NEW.removed_at IS NULL THEN 1 ELSE -1 END)
    WHERE id = NEW.author_id;
END;
`,
  // Link previews: the title and description of a link in a post, read from its page once and kept. A page that could
  // not be read keeps a row with no title, so it is not fetched again on every view until the row is stale.
  `
CREATE TABLE IF NOT EXISTS link_previews (
  url TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  site TEXT,
  fetched_at INTEGER NOT NULL
);
`,
  // The picture of a link preview, kept on this site. Its name is also how the media route knows it is public.
  `
ALTER TABLE link_previews ADD COLUMN image_file TEXT;
CREATE INDEX IF NOT EXISTS link_previews_image ON link_previews(image_file);
`,
  // Payments through Stripe. A subscription (Plus removes ads and extends the edit window; paid verification shows a
  // subscriber badge that makes no identity claim), a tip to a creator, and a creator's payout account. Money is kept
  // in the minor units Stripe uses. Every webhook event is recorded once, so a repeated delivery changes nothing.
  `
ALTER TABLE users ADD COLUMN paid_verified INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('plus', 'verified')),
  status TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  current_period_end INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(user_id, kind);
CREATE TABLE IF NOT EXISTS connect_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL UNIQUE,
  charges_enabled INTEGER NOT NULL DEFAULT 0,
  payouts_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tips (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payment_intent TEXT,
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tips_to ON tips(to_user_id, status);
CREATE INDEX IF NOT EXISTS tips_intent ON tips(payment_intent);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
`,
  // Self-serve advertising. An advertiser has an account with a prepaid balance (added through Stripe). A campaign is
  // one sponsored post, reviewed by a person before it can run. Every charge is a ledger row, unique per reference, so
  // a repeat cannot charge twice. Money is in micro-units (one cent is 10,000) so a fraction of a cent is never lost.
  `
CREATE TABLE IF NOT EXISTS ad_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  country TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance_micro INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  policy_accepted_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  cta TEXT NOT NULL,
  link_url TEXT NOT NULL,
  picture_file TEXT,
  topic TEXT,
  budget_micro INTEGER NOT NULL,
  spent_micro INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('in_review', 'rejected', 'active', 'paused', 'ended')),
  review_note TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_campaigns_account ON ad_campaigns(account_id, created_at);
CREATE INDEX IF NOT EXISTS ad_campaigns_status ON ad_campaigns(status);
CREATE TABLE IF NOT EXISTS ad_ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'spend')),
  amount_micro INTEGER NOT NULL,
  reference TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_ledger_reference ON ad_ledger(kind, reference);
`,
  // Every decision about an advertising campaign or account, written by scripts/ads.mjs, with the time it was made.
  `
CREATE TABLE IF NOT EXISTS ad_decisions (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_decisions_target ON ad_decisions(target, created_at);
`,
  // An author can hide the counts on their own posts (likes, reposts, replies, quotes, views). They still see them.
  `
ALTER TABLE users ADD COLUMN hide_counts INTEGER NOT NULL DEFAULT 0;
`,
  // A person's report of an ad. One report per person per campaign. Reviewed with scripts/ads.mjs.
  `
CREATE TABLE IF NOT EXISTS ad_reports (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('misleading', 'prohibited', 'political', 'other')),
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (campaign_id, reporter_id)
);
`,
  // Spam checks. Each published post keeps a fingerprint of its words (links and punctuation left out), so the same
  // message from many accounts is found with one lookup. The result of the checks is kept per post: the score, what
  // was done (allow, limit or hold) and the reasons. A limited post stays out of other people's For you feeds and sends
  // no notifications; a held post is hidden with a notice to its author.
  `
ALTER TABLE posts ADD COLUMN text_hash TEXT;
CREATE INDEX IF NOT EXISTS posts_text_hash ON posts(text_hash, created_at);
CREATE TABLE IF NOT EXISTS post_risk (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('allow', 'limit', 'hold')),
  reasons TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS post_risk_action ON post_risk(action);
`,
  // What the For you feed learns from (lib/feed-learning.ts). An impression is a post put in someone's For you, with where it
  // came from and the features the model saw; one row per viewer and post, so a post shown again only moves its time. Dwell is
  // the milliseconds someone has had a post on screen. A hide is a post marked "Not interested". feed_model keeps the fitted
  // weights; `accepted` says whether they replace the hand-set ones.
  `
CREATE TABLE IF NOT EXISTS feed_impressions (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  features TEXT NOT NULL,
  served_at INTEGER NOT NULL,
  PRIMARY KEY (viewer_id, post_id)
);
CREATE INDEX IF NOT EXISTS feed_impressions_served ON feed_impressions(served_at);
CREATE TABLE IF NOT EXISTS post_dwell (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  dwell_ms INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (viewer_id, post_id)
);
CREATE INDEX IF NOT EXISTS post_dwell_updated ON post_dwell(updated_at);
CREATE TABLE IF NOT EXISTS feed_hides (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (viewer_id, post_id)
);
CREATE TABLE IF NOT EXISTS feed_model (
  name TEXT PRIMARY KEY,
  weights TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  positives INTEGER NOT NULL DEFAULT 0,
  prior_loss REAL,
  holdout_loss REAL,
  trained_at INTEGER NOT NULL
);
`,
  // 24. Connections. Where someone is: a country and a city or town, kept for matching and never shown on a profile or
  // to anyone else. The languages they speak (with a level) and are learning. Two switches, one for nearby suggestions and
  // one for language partners: a pair is matched only when both people have the switch on. Accounts made before this
  // step are marked skipped, so they are not asked to set up; new accounts start pending. A dismissal is a "not now" on a
  // suggestion. Posts and messages get a language guess, and translations are kept so each is asked for once.
  `
ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN area TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN area_key TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN suggest_nearby INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN suggest_language INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN onboarding TEXT NOT NULL DEFAULT 'skipped';
CREATE INDEX IF NOT EXISTS users_area ON users(country, area_key) WHERE area_key <> '' AND suggest_nearby = 1;
CREATE TABLE IF NOT EXISTS user_languages (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('speak', 'learn')),
  level TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, code, kind)
);
CREATE INDEX IF NOT EXISTS user_languages_code ON user_languages(code, kind);
CREATE TABLE IF NOT EXISTS connection_dismissals (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (viewer_id, user_id)
);
ALTER TABLE posts ADD COLUMN lang TEXT;
ALTER TABLE chat_messages ADD COLUMN lang TEXT;
CREATE TABLE IF NOT EXISTS post_translations (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, target)
);
CREATE TABLE IF NOT EXISTS message_translations (
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, target)
);
`,
  // Circles: a circle has a web address (slug), a one-line tagline in description, a charter of its own rules, and an
  // access setting. Asking to join keeps the applicant's answer to the circle's question until the owner decides.
  `
ALTER TABLE communities ADD COLUMN slug TEXT;
ALTER TABLE communities ADD COLUMN access TEXT NOT NULL DEFAULT 'open' CHECK (access IN ('open', 'request', 'closed'));
ALTER TABLE communities ADD COLUMN charter TEXT NOT NULL DEFAULT '';
ALTER TABLE communities ADD COLUMN join_question TEXT NOT NULL DEFAULT '';
ALTER TABLE communities ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS communities_slug ON communities(slug);
CREATE TABLE IF NOT EXISTS community_requests (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
`,
  `
ALTER TABLE posts ADD COLUMN title TEXT NOT NULL DEFAULT '';
`,
  `
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id);
`,
  // Sahayak, the account that answers when someone mentions @sahayak. It is an ordinary account row with the bot flag on.
  // Its password hash is not a valid scrypt hash, so no password can sign in as it. One job per asking post keeps a
  // mention from being answered twice.
  `ALTER TABLE users ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;
   INSERT OR IGNORE INTO users (id, handle, name, bio, password_hash, created_at, bot)
     VALUES ('sahayak-bot', 'sahayak', 'Sahayak', 'An AI assistant. Mention @sahayak under a post to ask it a question.', '!locked', CAST(strftime('%s', 'now') AS INTEGER) * 1000, 1);
   CREATE TABLE IF NOT EXISTS sahayak_jobs (
     post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
     asker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'queued',
     attempts INTEGER NOT NULL DEFAULT 0,
     run_after INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     finished_at INTEGER
   );
   CREATE INDEX IF NOT EXISTS sahayak_jobs_due ON sahayak_jobs (status, run_after);`,
  // Stickers on a photo: a JSON set (lib/stickers.ts) with the photo's shape and where each sticker sits. Null when there are none.
  `ALTER TABLE post_media ADD COLUMN stickers TEXT;`,
  // Human checks (lib/proof.ts). A puzzle a browser solves once: it is used up by any answer and is gone after it expires.
  // ip_hash is a keyed hash of the network it was issued to, so a busy network gets harder puzzles.
  `CREATE TABLE IF NOT EXISTS proof_challenges (
     id TEXT PRIMARY KEY,
     salt TEXT NOT NULL,
     bits INTEGER NOT NULL,
     ip_hash TEXT,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     used_at INTEGER
   );
   CREATE INDEX IF NOT EXISTS proof_challenges_ip ON proof_challenges (ip_hash, created_at);
   CREATE INDEX IF NOT EXISTS proof_challenges_expiry ON proof_challenges (expires_at);
   -- What an account was made or signed in from: keyed hashes of the network address and the browser, never the raw values.
   -- Used to see many accounts coming from one place (lib/risk.ts). Kept for RETENTION.signalsDays.
   CREATE TABLE IF NOT EXISTS account_signals (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     ip_hash TEXT,
     ua_hash TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS account_signals_network ON account_signals (kind, ip_hash, created_at);
   CREATE INDEX IF NOT EXISTS account_signals_browser ON account_signals (ua_hash, created_at);
   CREATE INDEX IF NOT EXISTS account_signals_user ON account_signals (user_id);`,
  // Scheduled posts. The publish check runs on every feed request and asks for rows that have a publish time, so the index
  // holds only those rows rather than every post in the table.
  `
CREATE INDEX IF NOT EXISTS posts_publish_due ON posts (publish_at) WHERE publish_at IS NOT NULL;
`,
  // State every server process shares. Several processes serve one port, so anything one of them keeps in memory would
  // be missed by the others. Events are passed between processes through this table, and each stream is recorded here so
  // any process can tell whether a person has a tab open. Call state, rate limits and the maintenance lease live here too.
  `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_created ON events (created_at);
CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  worker TEXT NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS streams_user ON streams (user_id, seen_at);
CREATE INDEX IF NOT EXISTS streams_worker ON streams (worker);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  doc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS calls_conversation ON calls (conversation_id);
CREATE TABLE IF NOT EXISTS queued_banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS queued_banners_user ON queued_banners (user_id, id);
CREATE TABLE IF NOT EXISTS rate_limits (
  limit_key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_reset ON rate_limits (reset_at);
CREATE TABLE IF NOT EXISTS leases (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`,
  // A message can answer another message in the same chat. Deleting the original keeps the reply.
  `ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT REFERENCES chat_messages (id) ON DELETE SET NULL;`,
  // The state, province or region a city is in. Shown with the city; it is not used to match people.
  `ALTER TABLE users ADD COLUMN region TEXT NOT NULL DEFAULT '';`,
  // Clicks on a post, by what was clicked. Only counts are kept: nothing says who clicked.
  `CREATE TABLE IF NOT EXISTS post_clicks (
    post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS post_clicks_post ON post_clicks (post_id, kind);`,
  // A followed topic snoozed for a while: its posts stay out of For you until the time passes. The topic stays followed.
  `CREATE TABLE IF NOT EXISTS topic_snoozes (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    until_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, tag)
  );`,
  // The author says the post was made with AI. The label is shown on the post; nothing checks it.
  `ALTER TABLE posts ADD COLUMN made_with_ai INTEGER NOT NULL DEFAULT 0;`,
  // Accounts whose activity the viewer wants in the Priority tab of notifications. Only accounts still followed count.
  `CREATE TABLE IF NOT EXISTS priority_accounts (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, account_id)
  );`,
  // A public list published as a starter pack: it is listed on /packs, and anyone can follow everyone in it at once.
  `ALTER TABLE lists ADD COLUMN starter INTEGER NOT NULL DEFAULT 0;`,
  `CREATE INDEX IF NOT EXISTS lists_starter ON lists (created_at) WHERE starter = 1;`,
  // Lists a viewer pinned as tabs on Home. Each tab shows that list's posts, in the order they were pinned.
  `CREATE TABLE IF NOT EXISTS timeline_pins (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    list_id TEXT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, list_id)
  );`,
]

type Globals = { __rhenkoDb?: DatabaseSync }
const globals = globalThis as unknown as Globals

// Several server processes start against one database, so each step takes the write lock and reads the version under it. A
// process that starts while another is migrating waits, then finds the step already applied and moves on.
function migrate(instance: DatabaseSync): void {
  for (;;) {
    instance.exec("BEGIN IMMEDIATE")
    try {
      const { user_version: version } = instance.prepare("PRAGMA user_version").get() as { user_version: number }
      if (version >= MIGRATIONS.length) {
        instance.exec("COMMIT")
        return
      }
      instance.exec(MIGRATIONS[version])
      instance.exec(`PRAGMA user_version = ${version + 1}`)
      instance.exec("COMMIT")
    } catch (error) {
      instance.exec("ROLLBACK")
      throw error
    }
  }
}

export function db(): DatabaseSync {
  if (!globals.__rhenkoDb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    const instance = new DatabaseSync(path.join(DATA_DIR, "rhenko.sqlite"))
    // The busy timeout comes first, so the settings below wait for another process rather than failing at once.
    // WAL lets readers run beside the writer. synchronous NORMAL is safe with WAL: a power cut can lose the last
    // commits, never corrupt the file. The cache and mmap keep hot pages in memory.
    instance.exec(`PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;
      PRAGMA cache_size = -65536; PRAGMA temp_store = MEMORY; PRAGMA mmap_size = 268435456;`)
    migrate(instance)
    globals.__rhenkoDb = instance
  }
  return globals.__rhenkoDb
}

// Refreshes the statistics the query planner uses. Runs now and then from maintenance, which is cheap and keeps
// the plans right as the data grows.
export function optimizeDatabase(): void {
  db().exec("PRAGMA optimize")
}

// Compiled statements are kept, so a query that runs on every request is compiled once rather than on every call.
// Least recently used statements go first when the cache is full.
const STATEMENT_CACHE_SIZE = 300
const statements = new Map<string, StatementSync>()

function statement(sql: string): StatementSync {
  const cached = statements.get(sql)
  if (cached) {
    statements.delete(sql)
    statements.set(sql, cached)
    return cached
  }
  const prepared = db().prepare(sql)
  statements.set(sql, prepared)
  if (statements.size > STATEMENT_CACHE_SIZE) statements.delete(statements.keys().next().value as string)
  return prepared
}

export type Param = string | number | null

// node:sqlite rows have a null prototype, and React refuses to pass those from a server
// component to a client component. Each row is copied into a plain object here.
export function all<T>(sql: string, ...params: Param[]): T[] {
  return statement(sql)
    .all(...params)
    .map((row) => ({ ...row })) as unknown as T[]
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  const row = statement(sql).get(...params)
  return row === undefined ? undefined : ({ ...row } as unknown as T)
}

export function run(sql: string, ...params: Param[]): void {
  statement(sql).run(...params)
}

// Runs a statement and returns how many rows it changed.
export function change(sql: string, ...params: Param[]): number {
  return Number(statement(sql).run(...params).changes)
}

// How many transactions are open in this process. A transaction opened inside another one is a savepoint of it, so
// functions that each take a transaction can call one another.
let openTransactions = 0

// Runs a function inside a transaction. Rolls back when it throws. BEGIN IMMEDIATE takes the write lock straight away, so
// no other process can change the data while the function runs.
export function transaction<T>(fn: () => T): T {
  const conn = db()
  if (openTransactions > 0) {
    const name = `sp${openTransactions}`
    conn.exec(`SAVEPOINT ${name}`)
    openTransactions++
    try {
      const result = fn()
      conn.exec(`RELEASE ${name}`)
      return result
    } catch (error) {
      conn.exec(`ROLLBACK TO ${name}`)
      conn.exec(`RELEASE ${name}`)
      throw error
    } finally {
      openTransactions--
    }
  }
  conn.exec("BEGIN IMMEDIATE")
  openTransactions++
  try {
    const result = fn()
    conn.exec("COMMIT")
    return result
  } catch (error) {
    conn.exec("ROLLBACK")
    throw error
  } finally {
    openTransactions--
  }
}
