import { all, get, type Param } from "@/lib/db"
import { extractHashtags, extractMentions, NOTE_SHOW_MIN_HELPFUL, normalizeTag, RECENT_SEARCH_LIMIT, type ReplySetting } from "@/lib/rules"
import type { MediaKind } from "@/lib/uploads"

// Shared read models. Everything a page or API route renders comes from here,
// so visibility rules (blocks, mutes, protected accounts, muted words) are
// applied in one place.

export type MiniUser = {
  id: string
  handle: string
  name: string
  avatarFile: string | null
  verified: boolean
}

export type MediaItem = { id: string; file: string; kind: MediaKind; alt: string }

export type PollOption = { id: string; label: string; votes: number }

export type PollView = {
  endsAt: number
  total: number
  myOptionId: string | null
  options: PollOption[]
}

export type PostCore = {
  id: string
  body: string
  createdAt: number
  editedAt: number | null
  publishAt: number | null
  isDraft: boolean
  media: MediaItem[]
  sensitive: boolean
  replyToId: string | null
  replyToHandle: string | null
  quoteOfId: string | null
  replySetting: ReplySetting
  canReply: boolean
  poll: PollView | null
  author: MiniUser
  replies: number
  reposts: number
  likes: number
  quotes: number
  views: number
  liked: boolean
  reposted: boolean
  bookmarked: boolean
  highlighted: boolean
  pinned: boolean
  // A reply the parent's author hid. Only the parent's author and the reply's author see it.
  hiddenByParent: boolean
  // The viewer wrote the post this one replies to, so they can hide this reply.
  canHideReply: boolean
  // At least one community note on this post has earned a public display.
  hasNote: boolean
}

export type PostView = PostCore & { quoted: PostCore | null }

export type FeedItem = {
  key: string
  sortAt: number
  post: PostView
  repostedBy: MiniUser | null
  folderId: string | null
}

export type Page<T> = { items: T[]; next: string | null }

type PostRow = {
  id: string
  body: string
  created_at: number
  edited_at: number | null
  publish_at: number | null
  is_draft: number
  sensitive: number
  reply_to_id: string | null
  quote_of_id: string | null
  reply_setting: string
  reply_to_handle: string | null
  author_id: string
  author_handle: string
  author_name: string
  author_avatar: string | null
  author_verified: number
  replies: number
  reposts: number
  likes: number
  quotes: number
  views: number
  liked: number
  reposted: number
  bookmarked: number
  highlighted: number
  pinned: number
  blocked: number
  follows_author: number
  hidden_by_parent: number
  parent_is_mine: number
  has_note: number
}

type FeedRow = {
  key: string
  post_id: string
  sort_at: number
  reposter_id: string | null
  folder_id: string | null
}

const FAR_FUTURE = Number.MAX_SAFE_INTEGER
const LAST_KEY = "￿"

export function parseCursor(cursor: string | undefined): [number, string] {
  if (!cursor) return [FAR_FUTURE, LAST_KEY]
  const split = cursor.indexOf("|")
  if (split < 1) return [FAR_FUTURE, LAST_KEY]
  const at = Number(cursor.slice(0, split))
  if (!Number.isFinite(at)) return [FAR_FUTURE, LAST_KEY]
  return [at, cursor.slice(split + 1)]
}

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}

const LIVE = "p.is_draft = 0 AND p.publish_at IS NULL"

// Feed visibility for a viewer, applied to posts (alias p) and their authors (alias au).
function visibilityClause(viewerId: string): { sql: string; params: Param[] } {
  const words = all<{ word: string }>("SELECT word FROM muted_words WHERE user_id = ?", viewerId).map((r) => r.word)
  const wordClauses = words.map(() => "AND lower(p.body) NOT LIKE ? ESCAPE '\\'").join(" ")
  const sql = `${LIVE}
    AND au.deactivated_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = au.id) OR (b.blocker_id = au.id AND b.blocked_id = ?))
    AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = ? AND m.muted_id = au.id)
    AND (p.hidden_by_parent = 0 OR p.author_id = ? OR EXISTS (SELECT 1 FROM posts pp WHERE pp.id = p.reply_to_id AND pp.author_id = ?))
    AND (au.protected = 0 OR au.id = ? OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = au.id))
    ${wordClauses}`
  return {
    sql,
    params: [
      viewerId, // blocks, first direction
      viewerId, // blocks, second direction
      viewerId, // mutes
      viewerId, // hidden reply: the reply's own author
      viewerId, // hidden reply: the parent's author
      viewerId, // protected: the viewer's own account
      viewerId, // protected: follows
      ...words.map((w) => likePattern(w.toLowerCase())),
    ],
  }
}

function mediaFor(ids: string[]): Map<string, MediaItem[]> {
  const result = new Map<string, MediaItem[]>()
  if (ids.length === 0) return result
  const marks = ids.map(() => "?").join(",")
  const rows = all<{ id: string; post_id: string; file: string; kind: string; alt: string }>(
    `SELECT id, post_id, file, kind, alt FROM post_media WHERE post_id IN (${marks}) ORDER BY position ASC`,
    ...ids
  )
  for (const row of rows) {
    const list = result.get(row.post_id) ?? []
    list.push({ id: row.id, file: row.file, kind: row.kind === "video" ? "video" : "image", alt: row.alt })
    result.set(row.post_id, list)
  }
  return result
}

function pollsFor(ids: string[], viewerId: string): Map<string, PollView> {
  const result = new Map<string, PollView>()
  if (ids.length === 0) return result
  const marks = ids.map(() => "?").join(",")
  const polls = all<{ post_id: string; ends_at: number }>(`SELECT post_id, ends_at FROM polls WHERE post_id IN (${marks})`, ...ids)
  if (polls.length === 0) return result
  const options = all<{ id: string; post_id: string; label: string; votes: number }>(
    `SELECT o.id, o.post_id, o.label, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes
     FROM poll_options o WHERE o.post_id IN (${marks}) ORDER BY o.position ASC`,
    ...ids
  )
  const mine = all<{ post_id: string; option_id: string }>(
    `SELECT post_id, option_id FROM poll_votes WHERE user_id = ? AND post_id IN (${marks})`,
    viewerId,
    ...ids
  )
  const myVote = new Map(mine.map((r) => [r.post_id, r.option_id]))
  for (const poll of polls) {
    const own = options.filter((o) => o.post_id === poll.post_id)
    result.set(poll.post_id, {
      endsAt: poll.ends_at,
      total: own.reduce((sum, o) => sum + o.votes, 0),
      myOptionId: myVote.get(poll.post_id) ?? null,
      options: own.map((o) => ({ id: o.id, label: o.label, votes: o.votes })),
    })
  }
  return result
}

function viewerHandle(viewerId: string): string {
  return get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", viewerId)?.handle ?? ""
}

function fetchCores(ids: string[], viewerId: string): Map<string, PostCore> {
  const result = new Map<string, PostCore>()
  if (ids.length === 0) return result
  const marks = ids.map(() => "?").join(",")
  const rows = all<PostRow>(
    `SELECT p.id, p.body, p.created_at, p.edited_at, p.publish_at, p.is_draft, p.sensitive, p.reply_to_id, p.quote_of_id,
       p.reply_setting,
       (SELECT pu.handle FROM posts pp JOIN users pu ON pu.id = pp.author_id WHERE pp.id = p.reply_to_id) AS reply_to_handle,
       u.id AS author_id, u.handle AS author_handle, u.name AS author_name, u.avatar_file AS author_avatar, u.verified AS author_verified,
       (SELECT COUNT(*) FROM posts r WHERE r.reply_to_id = p.id AND r.is_draft = 0 AND r.publish_at IS NULL) AS replies,
       (SELECT COUNT(*) FROM reposts rp WHERE rp.post_id = p.id) AS reposts,
       (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
       (SELECT COUNT(*) FROM posts q WHERE q.quote_of_id = p.id AND q.is_draft = 0 AND q.publish_at IS NULL) AS quotes,
       (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id) AS views,
       EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
       EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id = p.id AND rp.user_id = ?) AS reposted,
       EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS bookmarked,
       EXISTS(SELECT 1 FROM highlights h WHERE h.post_id = p.id AND h.user_id = u.id) AS highlighted,
       (u.pinned_post_id = p.id) AS pinned,
       EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?)) AS blocked,
       EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id) AS follows_author,
       p.hidden_by_parent,
       EXISTS(SELECT 1 FROM posts pp WHERE pp.id = p.reply_to_id AND pp.author_id = ?) AS parent_is_mine,
       EXISTS(
         SELECT 1 FROM community_notes cn
         WHERE cn.post_id = p.id
           AND (SELECT COUNT(*) FROM community_note_ratings r WHERE r.note_id = cn.id AND r.helpful = 1) >= ?
           AND (SELECT COUNT(*) FROM community_note_ratings r WHERE r.note_id = cn.id AND r.helpful = 1)
             > (SELECT COUNT(*) FROM community_note_ratings r WHERE r.note_id = cn.id AND r.helpful = 0)
       ) AS has_note
     FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.id IN (${marks})`,
    viewerId, // liked
    viewerId, // reposted
    viewerId, // bookmarked
    viewerId, // blocked, first direction
    viewerId, // blocked, second direction
    viewerId, // follows the author
    viewerId, // is the author of the post this replies to
    NOTE_SHOW_MIN_HELPFUL,
    ...ids
  )
  const handle = viewerHandle(viewerId).toLowerCase()
  const polls = pollsFor(ids, viewerId)
  const media = mediaFor(ids)
  for (const r of rows) {
    const mentioned = r.reply_setting === "mentioned" && extractMentions(r.body).includes(handle)
    const canReply =
      r.author_id === viewerId ||
      (r.blocked === 0 &&
        (r.reply_setting === "everyone" ||
          (r.reply_setting === "following" && r.follows_author === 1) ||
          (r.reply_setting === "mentioned" && mentioned)))
    result.set(r.id, {
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      publishAt: r.publish_at,
      isDraft: r.is_draft === 1,
      media: media.get(r.id) ?? [],
      sensitive: r.sensitive === 1,
      replyToId: r.reply_to_id,
      replyToHandle: r.reply_to_handle,
      quoteOfId: r.quote_of_id,
      replySetting: (r.reply_setting as ReplySetting) ?? "everyone",
      canReply,
      poll: polls.get(r.id) ?? null,
      author: {
        id: r.author_id,
        handle: r.author_handle,
        name: r.author_name,
        avatarFile: r.author_avatar,
        verified: r.author_verified === 1,
      },
      replies: r.replies,
      reposts: r.reposts,
      likes: r.likes,
      quotes: r.quotes,
      views: r.views,
      liked: r.liked === 1,
      reposted: r.reposted === 1,
      bookmarked: r.bookmarked === 1,
      highlighted: r.highlighted === 1,
      pinned: r.pinned === 1,
      hiddenByParent: r.hidden_by_parent === 1,
      canHideReply: r.parent_is_mine === 1,
      hasNote: r.has_note === 1,
    })
  }
  return result
}

export function loadPosts(ids: string[], viewerId: string): PostView[] {
  const unique = [...new Set(ids)]
  const cores = fetchCores(unique, viewerId)
  const quoteIds = [...cores.values()].map((core) => core.quoteOfId).filter((id): id is string => id !== null)
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
  const rows = all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT id, handle, name, avatar_file, verified FROM users WHERE id IN (${marks})`,
    ...unique
  )
  for (const r of rows) {
    result.set(r.id, { id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 })
  }
  return result
}

// Every feed is a SELECT yielding (key, post_id, sort_at, reposter_id). Pages
// sort by sort_at then key, so the cursor stays stable across inserts.
function feedPage(
  source: string,
  sourceParams: Param[],
  cursor: string | undefined,
  limit: number,
  viewerId: string,
  postFilter?: (post: PostView) => boolean
): Page<FeedItem> {
  const [cursorAt, cursorKey] = parseCursor(cursor)
  const vis = visibilityClause(viewerId)
  const rows = all<FeedRow>(
    `SELECT feed.key, feed.post_id, feed.sort_at, feed.reposter_id, feed.folder_id
     FROM (${source}) feed
     JOIN posts p ON p.id = feed.post_id
     JOIN users au ON au.id = p.author_id
     WHERE ${vis.sql}
       AND (feed.reposter_id IS NULL OR (
         NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = feed.reposter_id) OR (b.blocker_id = feed.reposter_id AND b.blocked_id = ?))
         AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = ? AND m.muted_id = feed.reposter_id)))
       AND (feed.sort_at < ? OR (feed.sort_at = ? AND feed.key < ?))
     ORDER BY feed.sort_at DESC, feed.key DESC
     LIMIT ?`,
    ...sourceParams,
    ...vis.params,
    viewerId,
    viewerId,
    viewerId,
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
  const reposters = loadMiniUsers(page.flatMap((row) => (row.reposter_id ? [row.reposter_id] : [])))
  const items: FeedItem[] = []
  for (const row of page) {
    const post = postById.get(row.post_id)
    if (!post) continue
    if (postFilter && !postFilter(post)) continue
    items.push({
      key: row.key,
      sortAt: row.sort_at,
      post,
      repostedBy: row.reposter_id ? reposters.get(row.reposter_id) ?? null : null,
      folderId: row.folder_id ?? null,
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
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p
    WHERE p.reply_to_id IS NULL
      AND (? = 'all' OR p.author_id = ? OR p.author_id IN (${FOLLOWING}))
    UNION ALL
    SELECT 'repost:' || r.post_id || ':' || r.user_id AS key, r.post_id AS post_id, r.created_at AS sort_at, r.user_id AS reposter_id, NULL AS folder_id
    FROM reposts r
    WHERE (? = 'all' OR r.user_id = ? OR r.user_id IN (${FOLLOWING}))`
  return feedPage(source, [scope, viewerId, viewerId, scope, viewerId, viewerId], cursor, limit, viewerId)
}

// "highlights" is a feed of its own, shown inside the Posts section of a profile.
export type ProfileTab = "posts" | "highlights" | "replies" | "media" | "reposts" | "likes"

export function profileFeed(tab: ProfileTab, userId: string, viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  if (tab === "replies") {
    const source = `
      SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
      FROM posts p WHERE p.author_id = ? AND p.reply_to_id IS NOT NULL`
    return feedPage(source, [userId], cursor, limit, viewerId)
  }
  if (tab === "media") {
    const source = `
      SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
      FROM posts p WHERE p.author_id = ? AND EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)`
    return feedPage(source, [userId], cursor, limit, viewerId)
  }
  if (tab === "likes") {
    const source = `
      SELECT 'like:' || l.post_id || ':' || l.user_id AS key, l.post_id AS post_id, l.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
      FROM likes l WHERE l.user_id = ?`
    return feedPage(source, [userId], cursor, limit, viewerId)
  }
  if (tab === "highlights") {
    const source = `
      SELECT 'highlight:' || h.post_id AS key, h.post_id AS post_id, h.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
      FROM highlights h WHERE h.user_id = ?`
    return feedPage(source, [userId], cursor, limit, viewerId)
  }
  if (tab === "reposts") {
    const source = `
      SELECT 'repost:' || r.post_id || ':' || r.user_id AS key, r.post_id AS post_id, r.created_at AS sort_at, r.user_id AS reposter_id, NULL AS folder_id
      FROM reposts r WHERE r.user_id = ?`
    return feedPage(source, [userId], cursor, limit, viewerId)
  }
  // Original posts only: reposts have their own tab, and the pinned post is shown above the list.
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p
    WHERE p.author_id = ? AND p.reply_to_id IS NULL
      AND p.id IS NOT (SELECT pinned_post_id FROM users WHERE id = ?)`
  return feedPage(source, [userId, userId], cursor, limit, viewerId)
}

// folder: undefined = every bookmark, "none" = not in a folder, otherwise a folder id.
export function bookmarkFeed(viewerId: string, folder: string | undefined, cursor?: string, limit = 25): Page<FeedItem> {
  const filter = folder === undefined ? "" : folder === "none" ? "AND b.folder_id IS NULL" : "AND b.folder_id = ?"
  const source = `
    SELECT 'bookmark:' || b.post_id AS key, b.post_id AS post_id, b.created_at AS sort_at, NULL AS reposter_id, b.folder_id AS folder_id
    FROM bookmarks b WHERE b.user_id = ? ${filter}`
  const params: Param[] = folder === undefined || folder === "none" ? [viewerId] : [viewerId, folder]
  return feedPage(source, params, cursor, limit, viewerId)
}

export function listFeed(listId: string, viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const members = "SELECT user_id FROM list_members WHERE list_id = ?"
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p WHERE p.reply_to_id IS NULL AND p.author_id IN (${members})
    UNION ALL
    SELECT 'repost:' || r.post_id || ':' || r.user_id AS key, r.post_id AS post_id, r.created_at AS sort_at, r.user_id AS reposter_id, NULL AS folder_id
    FROM reposts r WHERE r.user_id IN (${members})`
  return feedPage(source, [listId, listId], cursor, limit, viewerId)
}

export function topicFeed(tag: string, viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const normalized = normalizeTag(tag)
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p WHERE lower(p.body) LIKE ? ESCAPE '\\' AND p.reply_to_id IS NULL`
  return feedPage(source, [likePattern(`#${normalized}`)], cursor, limit, viewerId, (post) =>
    extractHashtags(post.body).includes(normalized)
  )
}

// Search operators: from:handle, since:YYYY-MM-DD, until:YYYY-MM-DD,
// filter:images|videos|media|links|replies. Other words are matched in the text.
export type SearchQuery = {
  terms: string[]
  // Words that must not appear in the post, written as -word.
  exclude: string[]
  from: string | null
  // Replies to posts by this account.
  to: string | null
  since: number | null
  until: number | null
  minLikes: number | null
  minReposts: number | null
  filter: "images" | "videos" | "media" | "links" | "replies" | null
  raw: string
}

// Operators: from:, to:, since:, until:, filter:, min_likes:, min_reposts:, and -word to leave a word out.
export function parseSearch(raw: string): SearchQuery {
  const query: SearchQuery = {
    terms: [],
    exclude: [],
    from: null,
    to: null,
    since: null,
    until: null,
    minLikes: null,
    minReposts: null,
    filter: null,
    raw: raw.trim(),
  }
  const tokens = raw.match(/"[^"]+"|\S+/g) ?? []
  for (const token of tokens) {
    const op = /^(from|to|since|until|filter|min_likes|min_reposts):(.+)$/i.exec(token)
    if (op) {
      const key = op[1].toLowerCase()
      const value = op[2].replace(/^"|"$/g, "")
      if (key === "from") query.from = value.replace(/^@/, "")
      if (key === "to") query.to = value.replace(/^@/, "")
      if (key === "since" || key === "until") {
        const time = Date.parse(value)
        if (Number.isFinite(time)) query[key] = time
      }
      if (key === "min_likes" || key === "min_reposts") {
        const count = Math.floor(Number(value))
        if (Number.isFinite(count) && count >= 0) {
          if (key === "min_likes") query.minLikes = count
          else query.minReposts = count
        }
      }
      if (key === "filter") {
        const v = value.toLowerCase()
        if (v === "images" || v === "videos" || v === "media" || v === "links" || v === "replies") query.filter = v
      }
      continue
    }
    if (/^-[^-"]/.test(token)) {
      const word = token.slice(1).replace(/^"|"$/g, "").trim().toLowerCase()
      if (word) query.exclude.push(word)
      continue
    }
    const term = token.replace(/^"|"$/g, "").trim()
    if (term) query.terms.push(term)
  }
  return query
}

export function hasSearchContent(query: SearchQuery): boolean {
  return (
    query.terms.length > 0 ||
    query.from !== null ||
    query.to !== null ||
    query.filter !== null ||
    query.since !== null ||
    query.until !== null ||
    query.minLikes !== null ||
    query.minReposts !== null
  )
}

export function searchPostFeed(
  query: SearchQuery,
  sort: "top" | "latest",
  viewerId: string,
  cursor?: string,
  limit = 25
): Page<FeedItem> {
  const clauses: string[] = [LIVE]
  const params: Param[] = []
  for (const term of query.terms) {
    clauses.push("p.body LIKE ? ESCAPE '\\'")
    params.push(likePattern(term))
  }
  if (query.from) {
    clauses.push("u.handle = ? COLLATE NOCASE")
    params.push(query.from)
  }
  if (query.since !== null) {
    clauses.push("p.created_at >= ?")
    params.push(query.since)
  }
  if (query.until !== null) {
    clauses.push("p.created_at < ?")
    params.push(query.until + 24 * 60 * 60 * 1000)
  }
  if (query.to) {
    clauses.push(
      "EXISTS (SELECT 1 FROM posts parent JOIN users pu ON pu.id = parent.author_id WHERE parent.id = p.reply_to_id AND pu.handle = ? COLLATE NOCASE)"
    )
    params.push(query.to)
  }
  for (const word of query.exclude) {
    clauses.push("lower(p.body) NOT LIKE ? ESCAPE '\\'")
    params.push(likePattern(word))
  }
  if (query.minLikes !== null) {
    clauses.push("(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) >= ?")
    params.push(query.minLikes)
  }
  if (query.minReposts !== null) {
    clauses.push("(SELECT COUNT(*) FROM reposts rp WHERE rp.post_id = p.id) >= ?")
    params.push(query.minReposts)
  }
  if (query.filter === "replies") clauses.push("p.reply_to_id IS NOT NULL")
  if (query.filter === "links") clauses.push("p.body LIKE '%http%'")
  if (query.filter === "media") clauses.push("EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)")
  if (query.filter === "images") clauses.push("EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.kind = 'image')")
  if (query.filter === "videos") clauses.push("EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.kind = 'video')")
  const sortAt =
    sort === "top"
      ? `((SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) + 2 * (SELECT COUNT(*) FROM reposts rp WHERE rp.post_id = p.id) + (SELECT COUNT(*) FROM posts c WHERE c.reply_to_id = p.id))`
      : "p.created_at"
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, ${sortAt} AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE ${clauses.join(" AND ")}`
  return feedPage(source, params, cursor, limit, viewerId)
}

// Drafts and scheduled posts belong to their author, so they skip the public visibility rules.
export function ownPending(viewerId: string, mode: "draft" | "scheduled"): PostView[] {
  const condition = mode === "draft" ? "p.is_draft = 1" : "p.is_draft = 0 AND p.publish_at IS NOT NULL"
  const rows = all<{ id: string }>(
    `SELECT p.id FROM posts p WHERE p.author_id = ? AND ${condition} ORDER BY p.created_at DESC LIMIT 100`,
    viewerId
  )
  return loadPosts(
    rows.map((r) => r.id),
    viewerId
  )
}

// Replies under a post, oldest first. They pass through the same visibility rules as
// every feed, so blocked, muted and hidden replies stay out of the thread.
export function repliesTo(postId: string, viewerId: string): PostView[] {
  const source = `
    SELECT 'reply:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p WHERE p.reply_to_id = ?`
  return feedPage(source, [postId], undefined, 200, viewerId)
    .items.map((item) => item.post)
    .reverse()
}

export type Relationship = {
  self: boolean
  following: boolean
  requested: boolean
  followsMe: boolean
  blockedByMe: boolean
  blockedMe: boolean
  muted: boolean
}

export function relationshipWith(viewerId: string, targetId: string): Relationship {
  if (viewerId === targetId) {
    return { self: true, following: false, requested: false, followsMe: false, blockedByMe: false, blockedMe: false, muted: false }
  }
  const row = get<{
    following: number
    requested: number
    follows_me: number
    blocked_by_me: number
    blocked_me: number
    muted: number
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?) AS following,
       EXISTS(SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?) AS requested,
       EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?) AS follows_me,
       EXISTS(SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?) AS blocked_by_me,
       EXISTS(SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?) AS blocked_me,
       EXISTS(SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?) AS muted`,
    viewerId,
    targetId,
    viewerId,
    targetId,
    targetId,
    viewerId,
    viewerId,
    targetId,
    targetId,
    viewerId,
    viewerId,
    targetId
  ) ?? { following: 0, requested: 0, follows_me: 0, blocked_by_me: 0, blocked_me: 0, muted: 0 }
  return {
    self: false,
    following: row.following === 1,
    requested: row.requested === 1,
    followsMe: row.follows_me === 1,
    blockedByMe: row.blocked_by_me === 1,
    blockedMe: row.blocked_me === 1,
    muted: row.muted === 1,
  }
}

export type ProfileView = {
  id: string
  handle: string
  name: string
  bio: string
  location: string
  website: string
  avatarFile: string | null
  bannerFile: string | null
  status: string
  createdAt: number
  followers: number
  following: number
  posts: number
  verified: boolean
  protected: boolean
  deactivated: boolean
  pinnedPostId: string | null
  birthday: string | null
  relationship: Relationship
  // The viewer asked to hear about every new post from this account.
  notifying: boolean
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
    status: string
    created_at: number
    verified: number
    protected: number
    deactivated_at: number | null
    pinned_post_id: string | null
    birthday: string | null
    followers: number
    following: number
    posts: number
  }>(
    `SELECT u.id, u.handle, u.name, u.bio, u.location, u.website, u.avatar_file, u.banner_file, u.status, u.created_at,
       u.verified, u.protected, u.deactivated_at, u.pinned_post_id, u.birthday,
       (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
       (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following,
       (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.reply_to_id IS NULL AND p.is_draft = 0 AND p.publish_at IS NULL) AS posts
     FROM users u WHERE u.handle = ? COLLATE NOCASE`,
    handle
  )
  if (!row) return null
  const relationship = relationshipWith(viewerId, row.id)
  const isSelf = row.id === viewerId
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    bio: row.bio,
    location: row.location,
    website: row.website,
    avatarFile: row.avatar_file,
    bannerFile: row.banner_file,
    status: row.status,
    createdAt: row.created_at,
    followers: row.followers,
    following: row.following,
    posts: row.posts,
    verified: row.verified === 1,
    protected: row.protected === 1,
    deactivated: row.deactivated_at !== null,
    pinnedPostId: row.pinned_post_id,
    birthday: isSelf ? row.birthday : null,
    relationship,
    notifying: !isSelf && get("SELECT 1 AS found FROM post_subscriptions WHERE user_id = ? AND author_id = ?", viewerId, row.id) !== undefined,
  }
}

// People the viewer follows who also follow this account, for the "Followed by" line on a profile.
export function mutualFollowers(profileId: string, viewerId: string, limit = 3): { users: MiniUser[]; total: number } {
  const from = `FROM follows a
    JOIN follows b ON b.follower_id = a.followee_id AND b.followee_id = ?
    JOIN users u ON u.id = a.followee_id
    WHERE a.follower_id = ? AND u.deactivated_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks x WHERE x.blocker_id = ? AND x.blocked_id = u.id)`
  const params = [profileId, viewerId, viewerId]
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c ${from}`, ...params)?.c ?? 0
  const rows = all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified ${from} ORDER BY u.name COLLATE NOCASE LIMIT ?`,
    ...params,
    limit
  )
  return {
    users: rows.map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 })),
    total,
  }
}

export type UserCard = MiniUser & { bio: string; following: boolean; followsMe: boolean }

// A person card that is safe to show a viewer: blocked and deactivated accounts are left out.
const CARD_SQL = `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, u.bio,
  EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id) AS following,
  EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.followee_id = ?) AS follows_me
  FROM users u`

type CardRow = {
  id: string
  handle: string
  name: string
  avatar_file: string | null
  verified: number
  bio: string
  following: number
  follows_me: number
}

function toCard(r: CardRow): UserCard {
  return {
    id: r.id,
    handle: r.handle,
    name: r.name,
    avatarFile: r.avatar_file,
    verified: r.verified === 1,
    bio: r.bio,
    following: r.following === 1,
    followsMe: r.follows_me === 1,
  }
}

const NOT_HIDDEN = `u.deactivated_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))`

export function searchUsers(query: string, viewerId: string, limit = 20): UserCard[] {
  const pattern = likePattern(query)
  return all<CardRow>(
    `${CARD_SQL}
     WHERE (u.handle LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\') AND u.id <> ? AND ${NOT_HIDDEN}
     ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC, u.created_at DESC
     LIMIT ?`,
    viewerId,
    viewerId,
    pattern,
    pattern,
    viewerId,
    viewerId,
    viewerId,
    limit
  ).map(toCard)
}

export function whoToFollow(viewerId: string, limit = 3): UserCard[] {
  return all<CardRow>(
    `${CARD_SQL}
     WHERE u.id <> ? AND u.protected = 0 AND ${NOT_HIDDEN}
       AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?)
       AND u.id NOT IN (SELECT muted_id FROM mutes WHERE muter_id = ?)
     ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC, u.created_at DESC
     LIMIT ?`,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    limit
  ).map(toCard)
}

// Followers or following for one account, newest first.
export function peopleOf(kind: "followers" | "following", userId: string, viewerId: string, limit = 200): UserCard[] {
  const join = kind === "followers" ? "f.follower_id = u.id AND f.followee_id = ?" : "f.followee_id = u.id AND f.follower_id = ?"
  return all<CardRow>(
    `${CARD_SQL}
     JOIN follows f ON ${join}
     WHERE ${NOT_HIDDEN}
     ORDER BY f.created_at DESC LIMIT ?`,
    viewerId,
    viewerId,
    userId,
    viewerId,
    viewerId,
    limit
  ).map(toCard)
}

export function followRequestsFor(viewerId: string): (MiniUser & { createdAt: number })[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number; created_at: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, fr.created_at
     FROM follow_requests fr JOIN users u ON u.id = fr.requester_id
     WHERE fr.target_id = ? ORDER BY fr.created_at DESC`,
    viewerId
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1, createdAt: r.created_at }))
}

export function trendingTags(limit = 6): { tag: string; count: number }[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const rows = all<{ body: string }>(
    `SELECT body FROM posts WHERE created_at > ? AND is_draft = 0 AND publish_at IS NULL ORDER BY created_at DESC LIMIT 2000`,
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

export type NotificationKind = "like" | "repost" | "reply" | "quote" | "follow" | "mention" | "follow_request" | "poll" | "post"

export type NotificationView = {
  id: string
  kind: NotificationKind
  actor: MiniUser
  post: { id: string; body: string } | null
  createdAt: number
  read: boolean
}

export function notificationsFor(viewerId: string, filter: "all" | "mentions", limit = 80): NotificationView[] {
  const kinds = filter === "mentions" ? "AND n.kind IN ('mention', 'reply', 'quote')" : ""
  return all<{
    id: string
    kind: NotificationKind
    created_at: number
    read: number
    post_id: string | null
    post_body: string | null
    actor_id: string
    actor_handle: string
    actor_name: string
    actor_avatar: string | null
    actor_verified: number
  }>(
    `SELECT n.id, n.kind, n.created_at, n.read, n.post_id, pst.body AS post_body,
       u.id AS actor_id, u.handle AS actor_handle, u.name AS actor_name, u.avatar_file AS actor_avatar, u.verified AS actor_verified
     FROM notifications n
     JOIN users u ON u.id = n.actor_id
     LEFT JOIN posts pst ON pst.id = n.post_id
     WHERE n.recipient_id = ? AND u.deactivated_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = n.recipient_id AND b.blocked_id = n.actor_id)
       ${kinds}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    viewerId,
    limit
  ).map((r) => ({
    id: r.id,
    kind: r.kind,
    actor: { id: r.actor_id, handle: r.actor_handle, name: r.actor_name, avatarFile: r.actor_avatar, verified: r.actor_verified === 1 },
    post: r.post_id && r.post_body !== null ? { id: r.post_id, body: r.post_body } : null,
    createdAt: r.created_at,
    read: r.read === 1,
  }))
}

export function unreadNotificationCount(viewerId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE recipient_id = ? AND read = 0", viewerId)?.c ?? 0
}

export function pendingFollowRequestCount(viewerId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM follow_requests WHERE target_id = ?", viewerId)?.c ?? 0
}

export type ChatMemberView = MiniUser & { status: "accepted" | "requested"; lastReadAt: number }

export type ConversationSummary = {
  id: string
  kind: "dm" | "group"
  title: string
  others: MiniUser[]
  memberCount: number
  lastBody: string
  lastAt: number
  lastFromMe: boolean
  lastDeleted: boolean
  unread: number
  status: "accepted" | "requested"
}

function lastMessageOf(conversationId: string) {
  return get<{ body: string; sender_id: string; created_at: number; deleted_at: number | null; media_file: string | null; post_id: string | null }>(
    `SELECT body, sender_id, created_at, deleted_at, media_file, post_id FROM chat_messages
     WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    conversationId
  )
}

export function conversationSummaries(viewerId: string, status: "accepted" | "requested", limit = 60): ConversationSummary[] {
  const rows = all<{ id: string; kind: "dm" | "group"; title: string; updated_at: number; last_read_at: number }>(
    `SELECT c.id, c.kind, c.title, c.updated_at, cm.last_read_at
     FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.user_id = ? AND cm.status = ?
     ORDER BY c.updated_at DESC LIMIT ?`,
    viewerId,
    status,
    limit
  )
  return rows.map((row) => {
    const members = all<{ user_id: string }>(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ?",
      row.id
    ).map((m) => m.user_id)
    const users = loadMiniUsers(members)
    const others = members.filter((id) => id !== viewerId).map((id) => users.get(id)).filter((u): u is MiniUser => Boolean(u))
    const last = lastMessageOf(row.id)
    const unread =
      get<{ c: number }>(
        "SELECT COUNT(*) AS c FROM chat_messages WHERE conversation_id = ? AND sender_id <> ? AND created_at > ? AND deleted_at IS NULL",
        row.id,
        viewerId,
        row.last_read_at
      )?.c ?? 0
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      others,
      memberCount: members.length,
      lastBody: last?.deleted_at ? "" : last?.body || (last?.media_file ? "Sent a photo" : last?.post_id ? "Shared a post" : ""),
      lastAt: last?.created_at ?? row.updated_at,
      lastFromMe: last?.sender_id === viewerId,
      lastDeleted: Boolean(last?.deleted_at),
      unread,
      status,
    }
  })
}

export function unreadMessageCount(viewerId: string): number {
  return (
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM chat_messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
       WHERE cm.status = 'accepted' AND cm.muted = 0 AND m.sender_id <> ? AND m.created_at > cm.last_read_at AND m.deleted_at IS NULL`,
      viewerId,
      viewerId
    )?.c ?? 0
  )
}

export function requestCount(viewerId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM conversation_members WHERE user_id = ? AND status = 'requested'", viewerId)?.c ?? 0
}

export type ConversationView = {
  id: string
  kind: "dm" | "group"
  title: string
  status: "accepted" | "requested"
  members: ChatMemberView[]
  viewerIsCreator: boolean
  muted: boolean
}

// The conversation, if the viewer is a member. Null otherwise.
export function conversationFor(id: string, viewerId: string): ConversationView | null {
  const base = get<{
    id: string
    kind: "dm" | "group"
    title: string
    created_by: string | null
    status: "accepted" | "requested"
    muted: number
  }>(
    `SELECT c.id, c.kind, c.title, c.created_by, cm.status, cm.muted
     FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ?`,
    viewerId,
    id
  )
  if (!base) return null
  const rows = all<{ user_id: string; status: "accepted" | "requested"; last_read_at: number }>(
    "SELECT user_id, status, last_read_at FROM conversation_members WHERE conversation_id = ?",
    id
  )
  const users = loadMiniUsers(rows.map((r) => r.user_id))
  const members: ChatMemberView[] = []
  for (const row of rows) {
    const user = users.get(row.user_id)
    if (user) members.push({ ...user, status: row.status, lastReadAt: row.last_read_at })
  }
  return {
    id: base.id,
    kind: base.kind,
    title: base.title,
    status: base.status,
    members,
    viewerIsCreator: base.created_by === viewerId,
    muted: base.muted === 1,
  }
}

export type MessageView = {
  id: string
  senderId: string
  senderName: string
  senderHandle: string
  mine: boolean
  body: string
  deleted: boolean
  mediaFile: string | null
  post: PostView | null
  createdAt: number
  seen: boolean
  reactions: { emoji: string; count: number; mine: boolean }[]
}

export function conversationMessages(conversationId: string, viewerId: string, limit = 200): MessageView[] {
  const rows = all<{
    id: string
    sender_id: string
    body: string
    media_file: string | null
    post_id: string | null
    created_at: number
    deleted_at: number | null
    sender_name: string
    sender_handle: string
  }>(
    `SELECT m.id, m.sender_id, m.body, m.media_file, m.post_id, m.created_at, m.deleted_at, u.name AS sender_name, u.handle AS sender_handle
     FROM chat_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    conversationId,
    limit
  ).reverse()
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const marks = ids.map(() => "?").join(",")
  const reactionRows = all<{ message_id: string; emoji: string; c: number; mine: number }>(
    `SELECT message_id, emoji, COUNT(*) AS c, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
     FROM message_reactions WHERE message_id IN (${marks}) GROUP BY message_id, emoji ORDER BY MIN(created_at)`,
    viewerId,
    ...ids
  )
  const reactions = new Map<string, { emoji: string; count: number; mine: boolean }[]>()
  for (const r of reactionRows) {
    const list = reactions.get(r.message_id) ?? []
    list.push({ emoji: r.emoji, count: r.c, mine: r.mine === 1 })
    reactions.set(r.message_id, list)
  }
  // A message is seen once every other member has read past it.
  const readers = all<{ user_id: string; last_read_at: number }>(
    "SELECT user_id, last_read_at FROM conversation_members WHERE conversation_id = ? AND status = 'accepted'",
    conversationId
  )
  const posts = new Map(loadPosts([...new Set(rows.flatMap((r) => (r.post_id ? [r.post_id] : [])))], viewerId).map((p) => [p.id, p]))
  return rows.map((r) => {
    const others = readers.filter((m) => m.user_id !== r.sender_id)
    const seen = r.sender_id === viewerId && others.length > 0 && others.every((m) => m.last_read_at >= r.created_at)
    return {
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderHandle: r.sender_handle,
      mine: r.sender_id === viewerId,
      body: r.deleted_at ? "" : r.body,
      deleted: r.deleted_at !== null,
      mediaFile: r.deleted_at ? null : r.media_file,
      post: r.post_id && !r.deleted_at ? posts.get(r.post_id) ?? null : null,
      createdAt: r.created_at,
      seen,
      reactions: reactions.get(r.id) ?? [],
    }
  })
}

export type ListSummary = {
  id: string
  name: string
  description: string
  private: boolean
  owner: MiniUser
  memberCount: number
  isOwner: boolean
  followed: boolean
}

function listRowsWhere(where: string, params: Param[], viewerId: string): ListSummary[] {
  return all<{
    id: string
    name: string
    description: string
    private: number
    owner_id: string
    owner_handle: string
    owner_name: string
    owner_avatar: string | null
    owner_verified: number
    member_count: number
    followed: number
  }>(
    `SELECT l.id, l.name, l.description, l.private, l.owner_id,
       u.handle AS owner_handle, u.name AS owner_name, u.avatar_file AS owner_avatar, u.verified AS owner_verified,
       (SELECT COUNT(*) FROM list_members m WHERE m.list_id = l.id) AS member_count,
       EXISTS(SELECT 1 FROM list_follows f WHERE f.list_id = l.id AND f.user_id = ?) AS followed
     FROM lists l JOIN users u ON u.id = l.owner_id
     WHERE ${where}
     ORDER BY l.created_at DESC`,
    viewerId,
    ...params
  ).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    private: r.private === 1,
    owner: { id: r.owner_id, handle: r.owner_handle, name: r.owner_name, avatarFile: r.owner_avatar, verified: r.owner_verified === 1 },
    memberCount: r.member_count,
    isOwner: r.owner_id === viewerId,
    followed: r.followed === 1,
  }))
}

export function listsFor(viewerId: string): { owned: ListSummary[]; followed: ListSummary[] } {
  return {
    owned: listRowsWhere("l.owner_id = ?", [viewerId], viewerId),
    followed: listRowsWhere(
      "l.id IN (SELECT list_id FROM list_follows WHERE user_id = ?) AND l.owner_id <> ? AND (l.private = 0)",
      [viewerId, viewerId],
      viewerId
    ),
  }
}

export function listDetail(id: string, viewerId: string): { list: ListSummary; members: MiniUser[] } | null {
  const list = listRowsWhere("l.id = ?", [id], viewerId)[0]
  if (!list) return null
  if (list.private && !list.isOwner) return null
  const members = all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified FROM list_members m JOIN users u ON u.id = m.user_id
     WHERE m.list_id = ? ORDER BY m.created_at DESC`,
    id
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 }))
  return { list, members }
}

export function bookmarkFolders(viewerId: string): { id: string; name: string; count: number }[] {
  return all<{ id: string; name: string; count: number }>(
    `SELECT f.id, f.name, (SELECT COUNT(*) FROM bookmarks b WHERE b.folder_id = f.id) AS count
     FROM bookmark_folders f WHERE f.user_id = ? ORDER BY f.created_at ASC`,
    viewerId
  )
}

export function topicFollowing(viewerId: string, tag: string): boolean {
  return get("SELECT 1 AS found FROM topic_follows WHERE user_id = ? AND tag = ?", viewerId, normalizeTag(tag)) !== undefined
}

export function followedTopics(viewerId: string): string[] {
  return all<{ tag: string }>("SELECT tag FROM topic_follows WHERE user_id = ? ORDER BY created_at DESC", viewerId).map((r) => r.tag)
}

export function blockedUsers(viewerId: string): MiniUser[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified FROM blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    viewerId
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 }))
}

export function mutedUsers(viewerId: string): MiniUser[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified FROM mutes m JOIN users u ON u.id = m.muted_id
     WHERE m.muter_id = ? ORDER BY m.created_at DESC`,
    viewerId
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 }))
}

export function mutedWords(viewerId: string): string[] {
  return all<{ word: string }>("SELECT word FROM muted_words WHERE user_id = ? ORDER BY created_at DESC", viewerId).map((r) => r.word)
}

export function highlightCount(userId: string): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM highlights WHERE user_id = ?", userId)?.c ?? 0
}

export function getMiniUserByHandle(handle: string): MiniUser | null {
  const row = get<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    "SELECT id, handle, name, avatar_file, verified FROM users WHERE handle = ? COLLATE NOCASE",
    handle
  )
  return row ? { id: row.id, handle: row.handle, name: row.name, avatarFile: row.avatar_file, verified: row.verified === 1 } : null
}

export function suggestHandles(prefix: string, limit = 6): MiniUser[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT id, handle, name, avatar_file, verified FROM users
     WHERE handle LIKE ? ESCAPE '\\' AND deactivated_at IS NULL
     ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = users.id) DESC LIMIT ?`,
    `${prefix.replace(/[\\%_]/g, (m) => `\\${m}`)}%`,
    limit
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 }))
}

export function suggestTags(prefix: string, limit = 6): string[] {
  const normalized = normalizeTag(prefix)
  return trendingTags(200)
    .map((t) => t.tag)
    .filter((tag) => tag.startsWith(normalized))
    .slice(0, limit)
}

// Community notes. A note is shown to everyone once enough people rate it helpful
// and helpful ratings outnumber unhelpful ones. Others see it in the rating list.
export type NoteView = {
  id: string
  body: string
  createdAt: number
  author: MiniUser
  helpful: number
  unhelpful: number
  myRating: boolean | null
  mine: boolean
  shown: boolean
}

export function notesFor(postId: string, viewerId: string): NoteView[] {
  return all<{
    id: string
    body: string
    created_at: number
    author_id: string
    author_handle: string
    author_name: string
    author_avatar: string | null
    author_verified: number
    helpful: number
    unhelpful: number
    my_rating: number | null
  }>(
    `SELECT n.id, n.body, n.created_at,
       u.id AS author_id, u.handle AS author_handle, u.name AS author_name, u.avatar_file AS author_avatar, u.verified AS author_verified,
       (SELECT COUNT(*) FROM community_note_ratings r WHERE r.note_id = n.id AND r.helpful = 1) AS helpful,
       (SELECT COUNT(*) FROM community_note_ratings r WHERE r.note_id = n.id AND r.helpful = 0) AS unhelpful,
       (SELECT r.helpful FROM community_note_ratings r WHERE r.note_id = n.id AND r.user_id = ?) AS my_rating
     FROM community_notes n
     JOIN users u ON u.id = n.author_id
     WHERE n.post_id = ? AND u.deactivated_at IS NULL
     ORDER BY (SELECT COUNT(*) FROM community_note_ratings r WHERE r.note_id = n.id AND r.helpful = 1)
       - (SELECT COUNT(*) FROM community_note_ratings r WHERE r.note_id = n.id AND r.helpful = 0) DESC,
       n.created_at ASC`,
    viewerId,
    postId
  ).map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    author: { id: r.author_id, handle: r.author_handle, name: r.author_name, avatarFile: r.author_avatar, verified: r.author_verified === 1 },
    helpful: r.helpful,
    unhelpful: r.unhelpful,
    myRating: r.my_rating === null ? null : r.my_rating === 1,
    mine: r.author_id === viewerId,
    shown: r.helpful >= NOTE_SHOW_MIN_HELPFUL && r.helpful > r.unhelpful,
  }))
}

// Earlier versions of a post, newest first. The live version comes first, then the
// versions that were replaced by edits.
export type EditVersion = { body: string; at: number; current: boolean }

export function editHistoryFor(postId: string): EditVersion[] {
  const post = get<{ body: string; created_at: number; edited_at: number | null }>(
    "SELECT body, created_at, edited_at FROM posts WHERE id = ?",
    postId
  )
  if (!post) return []
  const earlier = all<{ body: string; created_at: number }>(
    "SELECT body, created_at FROM post_edits WHERE post_id = ? ORDER BY created_at DESC",
    postId
  )
  return [
    { body: post.body, at: post.edited_at ?? post.created_at, current: true },
    ...earlier.map((row) => ({ body: row.body, at: row.created_at, current: false })),
  ]
}

export function recentSearches(viewerId: string): string[] {
  return all<{ query: string }>(
    "SELECT query FROM recent_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    viewerId,
    RECENT_SEARCH_LIMIT
  ).map((row) => row.query)
}

// Analytics for an account's own posts and profile. Visits and views are counted per day in UTC.
export type AnalyticsDay = { label: string; visits: number; views: number }

export type AnalyticsView = {
  visits7: number
  visits28: number
  views28: number
  followers: number
  newFollowers28: number
  days: AnalyticsDay[]
  topPosts: { id: string; handle: string; body: string; views: number; likes: number }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function analyticsFor(userId: string, handle: string, now = Date.now()): AnalyticsView {
  const today = Math.floor(now / DAY_MS)
  const windowStart = (today - 13) * DAY_MS
  const count = (sql: string, ...params: Param[]) => get<{ c: number }>(sql, ...params)?.c ?? 0

  const visitDays = all<{ day: number; c: number }>(
    `SELECT CAST(created_at / ? AS INTEGER) AS day, COUNT(*) AS c FROM profile_visits
     WHERE profile_id = ? AND created_at >= ? GROUP BY day`,
    DAY_MS,
    userId,
    windowStart
  )
  const viewDays = all<{ day: number; c: number }>(
    `SELECT CAST(v.created_at / ? AS INTEGER) AS day, COUNT(*) AS c FROM post_views v
     JOIN posts p ON p.id = v.post_id
     WHERE p.author_id = ? AND v.viewer_id <> p.author_id AND v.created_at >= ? GROUP BY day`,
    DAY_MS,
    userId,
    windowStart
  )
  const days: AnalyticsDay[] = []
  for (let offset = 13; offset >= 0; offset--) {
    const day = today - offset
    days.push({
      label: new Date(day * DAY_MS).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      visits: visitDays.find((row) => row.day === day)?.c ?? 0,
      views: viewDays.find((row) => row.day === day)?.c ?? 0,
    })
  }

  const topPosts = all<{ id: string; body: string; views: number; likes: number }>(
    `SELECT p.id, p.body,
       (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id AND v.viewer_id <> p.author_id) AS views,
       (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes
     FROM posts p
     WHERE p.author_id = ? AND p.is_draft = 0 AND p.publish_at IS NULL
     ORDER BY views DESC, p.created_at DESC
     LIMIT 5`,
    userId
  )
    .filter((row) => row.views > 0)
    .map((row) => ({ ...row, handle }))

  return {
    visits7: count("SELECT COUNT(*) AS c FROM profile_visits WHERE profile_id = ? AND created_at >= ?", userId, now - 7 * DAY_MS),
    visits28: count("SELECT COUNT(*) AS c FROM profile_visits WHERE profile_id = ? AND created_at >= ?", userId, now - 28 * DAY_MS),
    views28: count(
      `SELECT COUNT(*) AS c FROM post_views v JOIN posts p ON p.id = v.post_id
       WHERE p.author_id = ? AND v.viewer_id <> p.author_id AND v.created_at >= ?`,
      userId,
      now - 28 * DAY_MS
    ),
    followers: count("SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?", userId),
    newFollowers28: count("SELECT COUNT(*) AS c FROM follows WHERE followee_id = ? AND created_at >= ?", userId, now - 28 * DAY_MS),
    days,
    topPosts,
  }
}

export function mentionsVerifiedOnly(userId: string): boolean {
  return get<{ mentions_verified_only: number }>("SELECT mentions_verified_only FROM users WHERE id = ?", userId)?.mentions_verified_only === 1
}

export type PostAnalyticsView = {
  id: string
  handle: string
  body: string
  createdAt: number
  views: number
  likes: number
  reposts: number
  quotes: number
  replies: number
  bookmarks: number
  // Actions on the post per view, as a percentage. Null when nobody has viewed it yet.
  engagementRate: number | null
  days: { label: string; views: number }[]
}

// Analytics for one of the viewer's own posts. Anyone else gets null, so the page looks missing.
export function postAnalytics(postId: string, viewerId: string, now = Date.now()): PostAnalyticsView | null {
  const post = get<{ id: string; body: string; created_at: number; handle: string }>(
    `SELECT p.id, p.body, p.created_at, u.handle FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.id = ? AND p.author_id = ? AND p.is_draft = 0 AND p.publish_at IS NULL`,
    postId,
    viewerId
  )
  if (!post) return null

  const count = (sql: string, ...params: Param[]) => get<{ c: number }>(sql, ...params)?.c ?? 0
  const views = count("SELECT COUNT(*) AS c FROM post_views WHERE post_id = ? AND viewer_id <> ?", postId, viewerId)
  const likes = count("SELECT COUNT(*) AS c FROM likes WHERE post_id = ?", postId)
  const reposts = count("SELECT COUNT(*) AS c FROM reposts WHERE post_id = ?", postId)
  const quotes = count("SELECT COUNT(*) AS c FROM posts WHERE quote_of_id = ? AND is_draft = 0 AND publish_at IS NULL", postId)
  const replies = count("SELECT COUNT(*) AS c FROM posts WHERE reply_to_id = ? AND is_draft = 0 AND publish_at IS NULL", postId)
  const bookmarks = count("SELECT COUNT(*) AS c FROM bookmarks WHERE post_id = ?", postId)

  const today = Math.floor(now / DAY_MS)
  const viewDays = all<{ day: number; c: number }>(
    `SELECT CAST(created_at / ? AS INTEGER) AS day, COUNT(*) AS c FROM post_views
     WHERE post_id = ? AND viewer_id <> ? AND created_at >= ? GROUP BY day`,
    DAY_MS,
    postId,
    viewerId,
    (today - 13) * DAY_MS
  )
  const days: { label: string; views: number }[] = []
  for (let offset = 13; offset >= 0; offset--) {
    const day = today - offset
    days.push({
      label: new Date(day * DAY_MS).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      views: viewDays.find((row) => row.day === day)?.c ?? 0,
    })
  }

  const actions = likes + reposts + quotes + replies + bookmarks
  return {
    id: post.id,
    handle: post.handle,
    body: post.body,
    createdAt: post.created_at,
    views,
    likes,
    reposts,
    quotes,
    replies,
    bookmarks,
    engagementRate: views > 0 ? Math.round((actions / views) * 1000) / 10 : null,
    days,
  }
}
