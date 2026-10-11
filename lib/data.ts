import { all, get } from "@/lib/db"
import { extractHashtags } from "@/lib/rules"

export type MiniUser = {
  id: string
  handle: string
  name: string
  avatarFile: string | null
}

export type PostCore = {
  id: string
  body: string
  createdAt: number
  media: string | null
  replyToId: string | null
  replyToHandle: string | null
  quoteOfId: string | null
  author: MiniUser
  replies: number
  reposts: number
  likes: number
  quotes: number
  liked: boolean
  reposted: boolean
  bookmarked: boolean
}

export type PostView = PostCore & { quoted: PostCore | null }

export type FeedItem = {
  key: string
  sortAt: number
  post: PostView
  repostedBy: MiniUser | null
}

export type Page<T> = { items: T[]; next: string | null }

export type ProfileView = {
  id: string
  handle: string
  name: string
  bio: string
  location: string
  website: string
  avatarFile: string | null
  bannerFile: string | null
  createdAt: number
  followers: number
  following: number
  posts: number
  viewerFollows: boolean
}

type PostRow = {
  id: string
  body: string
  created_at: number
  media_file: string | null
  reply_to_id: string | null
  quote_of_id: string | null
  reply_to_handle: string | null
  author_id: string
  author_handle: string
  author_name: string
  author_avatar: string | null
  replies: number
  reposts: number
  likes: number
  quotes: number
  liked: number
  reposted: number
  bookmarked: number
}

type FeedRow = {
  key: string
  post_id: string
  sort_at: number
  reposter_id: string | null
}

type Param = string | number | null

const FAR_FUTURE = Number.MAX_SAFE_INTEGER
const LAST_KEY = "￿"

function parseCursor(cursor: string | undefined): [number, string] {
  if (!cursor) return [FAR_FUTURE, LAST_KEY]
  const split = cursor.indexOf("|")
  if (split < 1) return [FAR_FUTURE, LAST_KEY]
  const at = Number(cursor.slice(0, split))
  if (!Number.isFinite(at)) return [FAR_FUTURE, LAST_KEY]
  return [at, cursor.slice(split + 1)]
}

function fetchCores(ids: string[], viewerId: string): Map<string, PostCore> {
  const result = new Map<string, PostCore>()
  if (ids.length === 0) return result
  const marks = ids.map(() => "?").join(",")
  const rows = all<PostRow>(
    `SELECT p.id, p.body, p.created_at, p.media_file, p.reply_to_id, p.quote_of_id,
       (SELECT pu.handle FROM posts pp JOIN users pu ON pu.id = pp.author_id WHERE pp.id = p.reply_to_id) AS reply_to_handle,
       u.id AS author_id, u.handle AS author_handle, u.name AS author_name, u.avatar_file AS author_avatar,
       (SELECT COUNT(*) FROM posts r WHERE r.reply_to_id = p.id) AS replies,
       (SELECT COUNT(*) FROM reposts rp WHERE rp.post_id = p.id) AS reposts,
       (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
       (SELECT COUNT(*) FROM posts q WHERE q.quote_of_id = p.id) AS quotes,
       EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
       EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id = p.id AND rp.user_id = ?) AS reposted,
       EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS bookmarked
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.id IN (${marks})`,
    viewerId,
    viewerId,
    viewerId,
    ...ids
  )
  for (const r of rows) {
    result.set(r.id, {
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      media: r.media_file,
      replyToId: r.reply_to_id,
      replyToHandle: r.reply_to_handle,
      quoteOfId: r.quote_of_id,
      author: {
        id: r.author_id,
        handle: r.author_handle,
        name: r.author_name,
        avatarFile: r.author_avatar,
      },
      replies: r.replies,
      reposts: r.reposts,
      likes: r.likes,
      quotes: r.quotes,
      liked: r.liked === 1,
      reposted: r.reposted === 1,
      bookmarked: r.bookmarked === 1,
    })
  }
  return result
}

export function loadPosts(ids: string[], viewerId: string): PostView[] {
  const unique = [...new Set(ids)]
  const cores = fetchCores(unique, viewerId)
  const quoteIds = [...cores.values()]
    .map((core) => core.quoteOfId)
    .filter((id): id is string => id !== null)
  const quotes = fetchCores([...new Set(quoteIds)], viewerId)
  return ids.flatMap((id) => {
    const core = cores.get(id)
    if (!core) return []
    const quoted = core.quoteOfId ? quotes.get(core.quoteOfId) ?? null : null
    return [{ ...core, quoted }]
  })
}

export function getPost(id: string, viewerId: string): PostView | null {
  return loadPosts([id], viewerId)[0] ?? null
}

export function loadMiniUsers(ids: string[]): Map<string, MiniUser> {
  const result = new Map<string, MiniUser>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return result
  const marks = unique.map(() => "?").join(",")
  const rows = all<{ id: string; handle: string; name: string; avatar_file: string | null }>(
    `SELECT id, handle, name, avatar_file FROM users WHERE id IN (${marks})`,
    ...unique
  )
  for (const r of rows) {
    result.set(r.id, { id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file })
  }
  return result
}

// Every feed is a SELECT that yields (key, post_id, sort_at, reposter_id).
// The page query sorts by sort_at then key, which gives a stable cursor.
function feedPage(source: string, params: Param[], cursor: string | undefined, limit: number, viewerId: string): Page<FeedItem> {
  const [cursorAt, cursorKey] = parseCursor(cursor)
  const rows = all<FeedRow>(
    `SELECT * FROM (${source}) feed
     WHERE feed.sort_at < ? OR (feed.sort_at = ? AND feed.key < ?)
     ORDER BY feed.sort_at DESC, feed.key DESC
     LIMIT ?`,
    ...params,
    cursorAt,
    cursorAt,
    cursorKey,
    limit + 1
  )
  const hasMore = rows.length > limit
  const page = rows.slice(0, limit)
  const posts = loadPosts(
    page.map((row) => row.post_id),
    viewerId
  )
  const postById = new Map(posts.map((post) => [post.id, post]))
  const reposters = loadMiniUsers(
    page.flatMap((row) => (row.reposter_id ? [row.reposter_id] : []))
  )
  const items: FeedItem[] = []
  for (const row of page) {
    const post = postById.get(row.post_id)
    if (!post) continue
    items.push({
      key: row.key,
      sortAt: row.sort_at,
      post,
      repostedBy: row.reposter_id ? reposters.get(row.reposter_id) ?? null : null,
    })
  }
  const last = page[page.length - 1]
  const next = hasMore && last ? `${last.sort_at}|${last.key}` : null
  return { items, next }
}

const FOLLOWING = "SELECT followee_id FROM follows WHERE follower_id = ?"

export function homeFeed(mode: "for-you" | "following", viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const scope = mode === "following" ? "following" : "all"
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id
    FROM posts p
    WHERE p.reply_to_id IS NULL
      AND (? = 'all' OR p.author_id = ? OR p.author_id IN (${FOLLOWING}))
    UNION ALL
    SELECT 'repost:' || r.post_id || ':' || r.user_id AS key, r.post_id AS post_id, r.created_at AS sort_at, r.user_id AS reposter_id
    FROM reposts r
    WHERE (? = 'all' OR r.user_id = ? OR r.user_id IN (${FOLLOWING}))`
  return feedPage(source, [scope, viewerId, viewerId, scope, viewerId, viewerId], cursor, limit, viewerId)
}

export function profileFeed(
  tab: "posts" | "replies" | "likes",
  userId: string,
  viewerId: string,
  cursor?: string,
  limit = 25
): Page<FeedItem> {
  if (tab === "replies") {
    const source = `
      SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id
      FROM posts p WHERE p.author_id = ? AND p.reply_to_id IS NOT NULL`
    return feedPage(source, [userId], cursor, limit, viewerId)
  }
  if (tab === "likes") {
    const source = `
      SELECT 'like:' || l.post_id || ':' || l.user_id AS key, l.post_id AS post_id, l.created_at AS sort_at, NULL AS reposter_id
      FROM likes l WHERE l.user_id = ?`
    return feedPage(source, [userId], cursor, limit, viewerId)
  }
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id
    FROM posts p WHERE p.author_id = ? AND p.reply_to_id IS NULL
    UNION ALL
    SELECT 'repost:' || r.post_id || ':' || r.user_id AS key, r.post_id AS post_id, r.created_at AS sort_at, r.user_id AS reposter_id
    FROM reposts r WHERE r.user_id = ?`
  return feedPage(source, [userId, userId], cursor, limit, viewerId)
}

export function bookmarkFeed(viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const source = `
    SELECT 'bookmark:' || b.post_id AS key, b.post_id AS post_id, b.created_at AS sort_at, NULL AS reposter_id
    FROM bookmarks b WHERE b.user_id = ?`
  return feedPage(source, [viewerId], cursor, limit, viewerId)
}

export function searchPostFeed(query: string, viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`)
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id
    FROM posts p WHERE p.body LIKE ? ESCAPE '\\'`
  return feedPage(source, [`%${escaped}%`], cursor, limit, viewerId)
}

export function repliesTo(postId: string, viewerId: string): PostView[] {
  const rows = all<{ id: string }>(
    "SELECT id FROM posts WHERE reply_to_id = ? ORDER BY created_at ASC LIMIT 200",
    postId
  )
  return loadPosts(rows.map((r) => r.id), viewerId)
}

export function getProfileByHandle(handle: string, viewerId: string): ProfileView | null {
  const row = get<{
    id: string
    handle: string
    name: string
    bio: string
    location: string
    website: string
    avatar_file: string | null
    banner_file: string | null
    created_at: number
    followers: number
    following: number
    posts: number
    viewer_follows: number
  }>(
    `SELECT u.id, u.handle, u.name, u.bio, u.location, u.website, u.avatar_file, u.banner_file, u.created_at,
       (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
       (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following,
       (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.reply_to_id IS NULL) AS posts,
       EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id) AS viewer_follows
     FROM users u WHERE u.handle = ? COLLATE NOCASE`,
    viewerId,
    handle
  )
  if (!row) return null
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    bio: row.bio,
    location: row.location,
    website: row.website,
    avatarFile: row.avatar_file,
    bannerFile: row.banner_file,
    createdAt: row.created_at,
    followers: row.followers,
    following: row.following,
    posts: row.posts,
    viewerFollows: row.viewer_follows === 1,
  }
}

export type UserCard = MiniUser & { bio: string; following: boolean }

export function searchUsers(query: string, viewerId: string, limit = 20): UserCard[] {
  const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`)
  const pattern = `%${escaped}%`
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; bio: string; following: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.bio,
       EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id) AS following
     FROM users u
     WHERE (u.handle LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\') AND u.id <> ?
     ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC, u.created_at DESC
     LIMIT ?`,
    viewerId,
    pattern,
    pattern,
    viewerId,
    limit
  ).map((r) => ({
    id: r.id,
    handle: r.handle,
    name: r.name,
    avatarFile: r.avatar_file,
    bio: r.bio,
    following: r.following === 1,
  }))
}

export function whoToFollow(viewerId: string, limit = 3): UserCard[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; bio: string }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.bio FROM users u
     WHERE u.id <> ? AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?)
     ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC, u.created_at DESC
     LIMIT ?`,
    viewerId,
    viewerId,
    limit
  ).map((r) => ({
    id: r.id,
    handle: r.handle,
    name: r.name,
    avatarFile: r.avatar_file,
    bio: r.bio,
    following: false,
  }))
}

export function trendingTags(limit = 6): { tag: string; count: number }[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const rows = all<{ body: string }>(
    "SELECT body FROM posts WHERE created_at > ? ORDER BY created_at DESC LIMIT 2000",
    weekAgo
  )
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const tag of extractHashtags(row.body)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }))
}

export type NotificationView = {
  id: string
  kind: "like" | "repost" | "reply" | "quote" | "follow" | "mention"
  actor: MiniUser
  post: { id: string; body: string } | null
  createdAt: number
  read: boolean
}

export function notificationsFor(viewerId: string, limit = 80): NotificationView[] {
  return all<{
    id: string
    kind: NotificationView["kind"]
    created_at: number
    read: number
    post_id: string | null
    post_body: string | null
    actor_id: string
    actor_handle: string
    actor_name: string
    actor_avatar: string | null
  }>(
    `SELECT n.id, n.kind, n.created_at, n.read, n.post_id, pst.body AS post_body,
       u.id AS actor_id, u.handle AS actor_handle, u.name AS actor_name, u.avatar_file AS actor_avatar
     FROM notifications n
     JOIN users u ON u.id = n.actor_id
     LEFT JOIN posts pst ON pst.id = n.post_id
     WHERE n.recipient_id = ?
     ORDER BY n.created_at DESC
     LIMIT ?`,
    viewerId,
    limit
  ).map((r) => ({
    id: r.id,
    kind: r.kind,
    actor: { id: r.actor_id, handle: r.actor_handle, name: r.actor_name, avatarFile: r.actor_avatar },
    post: r.post_id && r.post_body !== null ? { id: r.post_id, body: r.post_body } : null,
    createdAt: r.created_at,
    read: r.read === 1,
  }))
}

export function unreadNotificationCount(viewerId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE recipient_id = ? AND read = 0", viewerId)?.c ?? 0
}

export function unreadMessageCount(viewerId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM messages WHERE recipient_id = ? AND read_at IS NULL", viewerId)?.c ?? 0
}

export type ConversationView = {
  user: MiniUser
  lastBody: string
  lastAt: number
  lastFromMe: boolean
  unread: number
}

export function conversationsFor(viewerId: string): ConversationView[] {
  const others = all<{ other_id: string; last_at: number }>(
    `SELECT other_id, MAX(created_at) AS last_at FROM (
       SELECT recipient_id AS other_id, created_at FROM messages WHERE sender_id = ?
       UNION ALL
       SELECT sender_id AS other_id, created_at FROM messages WHERE recipient_id = ?
     ) GROUP BY other_id ORDER BY last_at DESC LIMIT 50`,
    viewerId,
    viewerId
  )
  const users = loadMiniUsers(others.map((o) => o.other_id))
  const views: ConversationView[] = []
  for (const other of others) {
    const user = users.get(other.other_id)
    if (!user) continue
    const last = get<{ body: string; sender_id: string; created_at: number }>(
      `SELECT body, sender_id, created_at FROM messages
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      viewerId,
      user.id,
      user.id,
      viewerId
    )
    const unread =
      get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL",
        user.id,
        viewerId
      )?.c ?? 0
    views.push({
      user,
      lastBody: last?.body ?? "",
      lastAt: other.last_at,
      lastFromMe: last?.sender_id === viewerId,
      unread,
    })
  }
  return views
}

export type MessageView = { id: string; mine: boolean; body: string; createdAt: number }

export function threadWith(viewerId: string, otherId: string, limit = 200): MessageView[] {
  const rows = all<{ id: string; sender_id: string; body: string; created_at: number }>(
    `SELECT id, sender_id, body, created_at FROM messages
     WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    viewerId,
    otherId,
    otherId,
    viewerId,
    limit
  )
  return rows
    .reverse()
    .map((r) => ({ id: r.id, mine: r.sender_id === viewerId, body: r.body, createdAt: r.created_at }))
}

export function getMiniUserByHandle(handle: string): MiniUser | null {
  const row = get<{ id: string; handle: string; name: string; avatar_file: string | null }>(
    "SELECT id, handle, name, avatar_file FROM users WHERE handle = ? COLLATE NOCASE",
    handle
  )
  return row ? { id: row.id, handle: row.handle, name: row.name, avatarFile: row.avatar_file } : null
}
