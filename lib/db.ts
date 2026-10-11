import { DatabaseSync } from "node:sqlite"
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
    instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
    migrate(instance)
    globals.__rhenkoDb = instance
  }
  return globals.__rhenkoDb
}

export type Param = string | number | null

// node:sqlite rows have a null prototype, and React refuses to pass those from a server
// component to a client component. Each row is copied into a plain object here.
export function all<T>(sql: string, ...params: Param[]): T[] {
  return db()
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row })) as unknown as T[]
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  const row = db().prepare(sql).get(...params)
  return row === undefined ? undefined : ({ ...row } as unknown as T)
}

export function run(sql: string, ...params: Param[]): void {
  db().prepare(sql).run(...params)
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
