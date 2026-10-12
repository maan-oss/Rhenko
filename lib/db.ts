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
]

type Globals = { __rhenkoDb?: DatabaseSync }
const globals = globalThis as unknown as Globals

function migrate(instance: DatabaseSync): void {
  const row = instance.prepare("PRAGMA user_version").get() as { user_version: number }
  for (let step = row.user_version; step < MIGRATIONS.length; step++) {
    instance.exec("BEGIN")
    try {
      instance.exec(MIGRATIONS[step])
      instance.exec(`PRAGMA user_version = ${step + 1}`)
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
    // WAL lets readers run beside the writer. synchronous NORMAL is safe with WAL: a power cut can lose the last
    // commits, never corrupt the file. The cache and mmap keep hot pages in memory.
    instance.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000; PRAGMA cache_size = -65536; PRAGMA temp_store = MEMORY; PRAGMA mmap_size = 268435456;`)
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

// Runs a function inside a transaction. Rolls back when it throws.
export function transaction<T>(fn: () => T): T {
  const conn = db()
  conn.exec("BEGIN IMMEDIATE")
  try {
    const result = fn()
    conn.exec("COMMIT")
    return result
  } catch (error) {
    conn.exec("ROLLBACK")
    throw error
  }
}
