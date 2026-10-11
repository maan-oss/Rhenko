import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"

export const DATA_DIR = process.env.RHENKO_DATA_DIR ?? path.join(process.cwd(), "data")
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads")

const SCHEMA = `
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
`

type Globals = { __rhenkoDb?: DatabaseSync }
const globals = globalThis as unknown as Globals

export function db(): DatabaseSync {
  if (!globals.__rhenkoDb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    const instance = new DatabaseSync(path.join(DATA_DIR, "rhenko.sqlite"))
    instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
    instance.exec(SCHEMA)
    globals.__rhenkoDb = instance
  }
  return globals.__rhenkoDb
}

export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return db().prepare(sql).all(...params) as unknown as T[]
}

export function get<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return db().prepare(sql).get(...params) as unknown as T | undefined
}

export function run(sql: string, ...params: (string | number | null)[]): void {
  db().prepare(sql).run(...params)
}
