import { all, get, type Param } from "@/lib/db"
import { clickCountsByPost, clickCountsFor, emptyClickCounts, type ClickCounts } from "@/lib/post-clicks"
import {
  asReplySetting,
  extractHashtags,
  extractMentions,
  NOTE_SHOW_MIN_HELPFUL,
  NOTIFICATION_PAGE_SIZE,
  normalizeTag,
  RECENT_SEARCH_LIMIT,
  SAVED_SEARCH_LIMIT,
  replyAllowed,
  type ReplySetting,
} from "@/lib/rules"
import type { MediaKind } from "@/lib/uploads"
import { isVoiceFile } from "@/lib/media-names"
import { parseStickerSet, type StickerSet } from "@/lib/stickers"
import { firstLink, previewsFor, requestPreviews, type LinkPreview } from "@/lib/link-previews"
import { callSummary, type CallOutcome } from "@/lib/format"
import { featuresOf, rank, RANK_WINDOW_MS, SMALL_AUTHOR, type Candidate, type Source } from "@/lib/ranking"
import { dwellSince, hiddenPosts, modelWeights, recentlyServed, recordImpressions } from "@/lib/feed-learning"

// Shared read models. Everything a page or API route renders comes from here,
// so visibility rules (blocks, mutes, protected accounts, muted words) are
// applied in one place.

export type MiniUser = {
  id: string
  handle: string
  name: string
  avatarFile: string | null
  verified: boolean
  // An active paid verification subscription. It makes no identity claim, so it is shown apart from `verified`.
  paidVerified?: boolean
  // The account is Sahayak, an AI assistant, and says so wherever it appears.
  bot?: boolean
}

export type MediaItem = { id: string; file: string; kind: MediaKind; alt: string; stickers: StickerSet | null }

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
  // The title of an article, or "" for an ordinary post.
  title: string
  createdAt: number
  editedAt: number | null
  publishAt: number | null
  isDraft: boolean
  media: MediaItem[]
  sensitive: boolean
  replyToId: string | null
  replyToHandle: string | null
  threadId: string | null
  quoteOfId: string | null
  // The circle the post was written in, shown as a label. Null for an ordinary post.
  circle: { slug: string; name: string } | null
  // The language the post is written in, as a code, or "" when it is not clear. Read by the translate button.
  lang: string
  // The first link in the post, with what its page says, once it has been read.
  preview: LinkPreview | null
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
  // The viewer can tip this post: it is not theirs and its author has finished setting up payouts.
  tippable: boolean
}

// `quoted` is null when the post quotes nothing, and also when the quoted post is hidden from the viewer (a block, a
// protected account they don't follow, a hidden reply, a deactivated author). `quotedUnavailable` is true in that
// second case, so the card can say the quoted post isn't available without showing any of it.
export type PostView = PostCore & { quoted: PostCore | null; quotedUnavailable: boolean }

export type FeedItem = {
  key: string
  sortAt: number
  post: PostView
  repostedBy: MiniUser | null
  folderId: string | null
}

export type Page<T> = { items: T[]; next: string | null }

type PostRow = {
  title: string
  id: string
  body: string
  lang: string | null
  created_at: number
  edited_at: number | null
  publish_at: number | null
  is_draft: number
  sensitive: number
  reply_to_id: string | null
  thread_id: string | null
  quote_of_id: string | null
  circle_slug: string | null
  circle_name: string | null
  reply_setting: string
  reply_to_handle: string | null
  author_id: string
  author_handle: string
  author_name: string
  author_avatar: string | null
  author_verified: number
  author_paid_verified: number
  author_bot: number
  author_hide_counts: number
  tippable: number
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
  author_follows_viewer: number
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
// Default page sizes for "Load earlier" messages and for followers and following.
const MESSAGE_PAGE_SIZE = 100
const PEOPLE_PAGE_SIZE = 50

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

// A word the post must contain, as a substring and ignoring case, like the LIKE it replaces. Terms of three or more
// characters use the trigram index; a shorter term has no trigram, so it keeps the scan.
function termClause(term: string): { sql: string; param: Param } {
  if ([...term].length >= 3) {
    return {
      sql: "p.search_id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)",
      param: `"${term.replace(/"/g, '""')}"`,
    }
  }
  return { sql: "p.body LIKE ? ESCAPE '\\'", param: likePattern(term) }
}

// A post hidden by moderation (removed_at) is gone for everyone, its author included, until it is restored.
const LIVE = "p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL"

// A post in a circle is shown to the circle's members and to its author. Posts in an open or ask-to-join circle are public
// like any other post. It takes the viewer's id twice: once for the author, once for membership.
const CIRCLE_VISIBLE = `(p.community_id IS NULL OR p.author_id = ?
    OR EXISTS (SELECT 1 FROM communities c WHERE c.id = p.community_id AND (c.access <> 'closed'
      OR EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = ?))))`

// Direct-access visibility for one viewer, applied to posts (alias p) and their authors (alias au). canSeePost and
// visiblePostIds share it, so a post, its quote and its media follow one rule. It takes the viewer's id nine times.
const CAN_SEE = `((p.is_draft = 0 AND p.publish_at IS NULL) OR p.author_id = ?)
  AND p.removed_at IS NULL
  AND au.deactivated_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = au.id) OR (b.blocker_id = au.id AND b.blocked_id = ?))
  AND (p.hidden_by_parent = 0 OR p.author_id = ? OR EXISTS (SELECT 1 FROM posts pp WHERE pp.id = p.reply_to_id AND pp.author_id = ?))
  AND (au.protected = 0 OR au.id = ? OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = au.id))
  AND ${CIRCLE_VISIBLE}`

function canSeeParams(viewerId: string): Param[] {
  return [viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId]
}

// One page of rows, newest first by a timestamp column, strictly older than `beforeAt` (null starts at the newest).
// Rows that share the timestamp at the end of a page all stay on that page, so the next page can start strictly
// before it without skipping or repeating a row. `select` is a full SELECT ending in its WHERE conditions.
function pageBefore<T>(
  select: string,
  params: Param[],
  atColumn: string,
  idColumn: string,
  atOf: (row: T) => number,
  beforeAt: number | null,
  limit: number
): { rows: T[]; next: number | null } {
  const before = beforeAt ?? FAR_FUTURE
  const rows = all<T>(`${select} AND ${atColumn} < ? ORDER BY ${atColumn} DESC, ${idColumn} DESC LIMIT ?`, ...params, before, limit + 1)
  if (rows.length <= limit) return { rows, next: null }
  const boundary = atOf(rows[limit - 1])
  if (atOf(rows[limit]) !== boundary) return { rows: rows.slice(0, limit), next: boundary }
  const tied = all<T>(`${select} AND ${atColumn} = ? ORDER BY ${idColumn} DESC`, ...params, boundary)
  const older = get<{ found: number }>(`SELECT EXISTS (${select} AND ${atColumn} < ?) AS found`, ...params, boundary)?.found === 1
  return { rows: [...rows.slice(0, limit).filter((row) => atOf(row) !== boundary), ...tied], next: older ? boundary : null }
}

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
    AND ${CIRCLE_VISIBLE}
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
      viewerId, // circle: the post's author
      viewerId, // circle: the viewer's membership
      ...words.map((w) => likePattern(w.toLowerCase())),
    ],
  }
}

function mediaFor(ids: string[]): Map<string, MediaItem[]> {
  const result = new Map<string, MediaItem[]>()
  if (ids.length === 0) return result
  const marks = ids.map(() => "?").join(",")
  const rows = all<{ id: string; post_id: string; file: string; kind: string; alt: string; stickers: string | null }>(
    `SELECT id, post_id, file, kind, alt, stickers FROM post_media WHERE post_id IN (${marks}) ORDER BY position ASC`,
    ...ids
  )
  for (const row of rows) {
    const list = result.get(row.post_id) ?? []
    const kind = row.kind === "video" ? "video" : "image"
    // A photo with stickers carries its set. A video never has one, and a set that no longer reads as valid is dropped.
    const stickers = kind === "image" ? parseStickerSet(row.stickers) : null
    list.push({ id: row.id, file: row.file, kind, alt: row.alt, stickers })
    result.set(row.post_id, list)
  }
  return result
}

function pollsFor(ids: string[], viewerId: string): Map<string, PollView> {
  const result = new Map<string, PollView>()
  if (ids.length === 0) return result
  const marks = ids.map(() => "?").join(",")
  const rows = all<{ post_id: string; ends_at: number; duration_ms: number; is_draft: number }>(
    `SELECT pl.post_id, pl.ends_at, pl.duration_ms, p.is_draft FROM polls pl JOIN posts p ON p.id = pl.post_id WHERE pl.post_id IN (${marks})`,
    ...ids
  )
  if (rows.length === 0) return result
  // A draft's poll starts when the draft is published, so until then it shows its full length.
  const now = Date.now()
  const polls = rows.map((row) => ({
    post_id: row.post_id,
    ends_at: row.is_draft === 1 && row.duration_ms > 0 ? now + row.duration_ms : row.ends_at,
  }))
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

// A post in a feed: an original post, or a continuation of the author's own thread.
const AUTHORED = "(p.reply_to_id IS NULL OR p.thread_id IS NOT NULL)"

function fetchCores(ids: string[], viewerId: string): Map<string, PostCore> {
  const hideFor = (r: PostRow) => r.author_hide_counts === 1 && r.author_id !== viewerId
  const result = new Map<string, PostCore>()
  if (ids.length === 0) return result
  const marks = ids.map(() => "?").join(",")
  const rows = all<PostRow>(
    `SELECT p.id, p.body, p.title, p.lang, p.created_at, p.edited_at, p.publish_at, p.is_draft, p.sensitive, p.reply_to_id, p.quote_of_id,
       p.reply_setting, p.thread_id, c.slug AS circle_slug, c.name AS circle_name,
       (SELECT pu.handle FROM posts pp JOIN users pu ON pu.id = pp.author_id WHERE pp.id = p.reply_to_id) AS reply_to_handle,
       u.id AS author_id, u.handle AS author_handle, u.name AS author_name, u.avatar_file AS author_avatar, u.verified AS author_verified,
       u.paid_verified AS author_paid_verified, u.bot AS author_bot,
       u.hide_counts AS author_hide_counts,
       (u.id <> ? AND EXISTS(SELECT 1 FROM connect_accounts ca WHERE ca.user_id = u.id AND ca.charges_enabled = 1)) AS tippable,
       p.replies_count AS replies,
       p.reposts_count AS reposts,
       p.likes_count AS likes,
       p.quotes_count AS quotes,
       p.views_count AS views,
       EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
       EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id = p.id AND rp.user_id = ?) AS reposted,
       EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS bookmarked,
       EXISTS(SELECT 1 FROM highlights h WHERE h.post_id = p.id AND h.user_id = u.id) AS highlighted,
       (u.pinned_post_id = p.id) AS pinned,
       EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?)) AS blocked,
       EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.followee_id = ?) AS author_follows_viewer,
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
     LEFT JOIN communities c ON c.id = p.community_id
     WHERE p.id IN (${marks})`,
    viewerId, // tippable: the viewer is not the author
    viewerId, // liked
    viewerId, // reposted
    viewerId, // bookmarked
    viewerId, // blocked, first direction
    viewerId, // blocked, second direction
    viewerId, // the author follows the viewer
    viewerId, // is the author of the post this replies to
    NOTE_SHOW_MIN_HELPFUL,
    ...ids
  )
  const handle = viewerHandle(viewerId).toLowerCase()
  // A post's first link shows a card. A link not read yet is read in the background, and shows on a later view.
  const linkOf = new Map<string, string>()
  for (const r of rows) {
    const link = firstLink(r.body)
    if (link) linkOf.set(r.id, link)
  }
  const links = [...new Set(linkOf.values())]
  const previews = previewsFor(links)
  requestPreviews(links)
  const polls = pollsFor(ids, viewerId)
  const media = mediaFor(ids)
  for (const r of rows) {
    const replySetting = asReplySetting(r.reply_setting)
    // The same rule the server applies when a reply is sent, so the reply button never offers what would be refused.
    const canReply =
      r.author_id === viewerId ||
      (r.blocked === 0 &&
        replyAllowed(replySetting, {
          isAuthor: false,
          isAnswered: r.parent_is_mine === 1,
          followedByAuthor: r.author_follows_viewer === 1,
          mentioned: replySetting === "mentioned" && extractMentions(r.body).includes(handle),
        }))
    result.set(r.id, {
      id: r.id,
      body: r.body,
      title: r.title ?? "",
      lang: r.lang ?? "",
      createdAt: r.created_at,
      editedAt: r.edited_at,
      publishAt: r.publish_at,
      isDraft: r.is_draft === 1,
      media: media.get(r.id) ?? [],
      sensitive: r.sensitive === 1,
      replyToId: r.reply_to_id,
      replyToHandle: r.thread_id === null ? r.reply_to_handle : null,
      threadId: r.thread_id,
      preview: linkOf.has(r.id) ? (previews.get(linkOf.get(r.id) ?? "") ?? null) : null,
      quoteOfId: r.quote_of_id,
      circle: r.circle_slug ? { slug: r.circle_slug, name: r.circle_name ?? "" } : null,
      replySetting,
      canReply,
      poll: polls.get(r.id) ?? null,
      author: {
        id: r.author_id,
        handle: r.author_handle,
        name: r.author_name,
        avatarFile: r.author_avatar,
        verified: r.author_verified === 1,
        paidVerified: r.author_paid_verified === 1,
        bot: r.author_bot === 1,
      },
      // Counts an author has hidden are zero for everyone else. Ranking is not affected by this: it only changes what is shown.
      replies: hideFor(r) ? 0 : r.replies,
      reposts: hideFor(r) ? 0 : r.reposts,
      likes: hideFor(r) ? 0 : r.likes,
      quotes: hideFor(r) ? 0 : r.quotes,
      views: hideFor(r) ? 0 : r.views,
      liked: r.liked === 1,
      reposted: r.reposted === 1,
      bookmarked: r.bookmarked === 1,
      highlighted: r.highlighted === 1,
      pinned: r.pinned === 1,
      hiddenByParent: r.hidden_by_parent === 1,
      canHideReply: r.parent_is_mine === 1,
      hasNote: r.has_note === 1,
      tippable: r.tippable === 1,
    })
  }
  return result
}

// Posts by id, in the order given. Callers pass posts the viewer may see; a quoted post is checked here, and one the
// viewer may not see comes back as unavailable rather than shown.
export function loadPosts(ids: string[], viewerId: string): PostView[] {
  const unique = [...new Set(ids)]
  const cores = fetchCores(unique, viewerId)
  const quoteIds = [...cores.values()].map((core) => core.quoteOfId).filter((id): id is string => id !== null)
  const visibleQuotes = visiblePostIds(quoteIds, viewerId)
  const quotes = fetchCores([...visibleQuotes], viewerId)
  return ids.flatMap((id) => {
    const core = cores.get(id)
    if (!core) return []
    const quoted = core.quoteOfId ? quotes.get(core.quoteOfId) ?? null : null
    return [{ ...core, quoted, quotedUnavailable: core.quoteOfId !== null && quoted === null }]
  })
}

// One post for its own page, or null when it is missing or hidden from this viewer.
export function getPost(id: string, viewerId: string): PostView | null {
  if (!canSeePost(id, viewerId)) return null
  return loadPosts([id], viewerId)[0] ?? null
}

// Whether a viewer may open a post directly, by its link or as a quote or a shared post. Drafts and scheduled posts
// are only for their author. Blocks, deactivated accounts, protected accounts and hidden replies apply. Mutes and
// muted words only hide posts from feeds and search, so they do not apply here.
export function canSeePost(postId: string, viewerId: string): boolean {
  return get(`SELECT 1 AS found FROM posts p JOIN users au ON au.id = p.author_id WHERE p.id = ? AND ${CAN_SEE}`, postId, ...canSeeParams(viewerId)) !== undefined
}

// canSeePost for a post that has gone live. Likes, reposts, bookmarks, votes, views, notes, replies and quotes need it:
// a draft or scheduled post has nothing to act on yet, even for its author.
export function canSeeLivePost(postId: string, viewerId: string): boolean {
  return (
    get(
      `SELECT 1 AS found FROM posts p JOIN users au ON au.id = p.author_id WHERE p.id = ? AND ${LIVE} AND ${CAN_SEE}`,
      postId,
      ...canSeeParams(viewerId)
    ) !== undefined
  )
}

// canSeePost for many posts at once: the ids this viewer may see. With `liveOnly`, drafts and scheduled posts are left out.
export function visiblePostIds(ids: string[], viewerId: string, liveOnly = false): Set<string> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Set()
  const marks = unique.map(() => "?").join(",")
  const rows = all<{ id: string }>(
    `SELECT p.id FROM posts p JOIN users au ON au.id = p.author_id WHERE p.id IN (${marks}) ${liveOnly ? `AND ${LIVE}` : ""} AND ${CAN_SEE}`,
    ...unique,
    ...canSeeParams(viewerId)
  )
  return new Set(rows.map((row) => row.id))
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
  postFilter?: (post: PostView, row: FeedRow) => boolean
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
  return pageOf(rows, limit, viewerId, postFilter)
}

// Turns the rows of one page into feed items. `rows` holds up to limit + 1 rows in feed order: the extra row only
// says whether a next page exists.
function pageOf(
  rows: FeedRow[],
  limit: number,
  viewerId: string,
  postFilter?: (post: PostView, row: FeedRow) => boolean
): Page<FeedItem> {
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
    if (postFilter && !postFilter(post, row)) continue
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

// One source of a timeline. Its WHERE clause already applies the visibility rules, so its LIMIT counts only posts the
// viewer may see. A timeline is several arms joined with UNION ALL. Each arm reads its own index in order and stops
// after one page, so the timeline never sorts every matching row. `from` names the posts as p and their authors as au.
type Arm = {
  from: string
  where: string
  params: Param[]
  key: string
  postId: string
  sortAt: string
  reposter: string
}

function timelinePage(
  arms: Arm[],
  cursor: string | undefined,
  limit: number,
  viewerId: string,
  postFilter?: (post: PostView, row: FeedRow) => boolean
): Page<FeedItem> {
  const [cursorAt, cursorKey] = parseCursor(cursor)
  const parts = arms.map(
    (arm) => `SELECT * FROM (
      SELECT ${arm.key} AS key, ${arm.postId} AS post_id, ${arm.sortAt} AS sort_at, ${arm.reposter} AS reposter_id, NULL AS folder_id
      FROM ${arm.from}
      WHERE ${arm.where} AND ${arm.sortAt} <= ? AND (${arm.sortAt} < ? OR (${arm.sortAt} = ? AND ${arm.key} < ?))
      ORDER BY sort_at DESC, key DESC
      LIMIT ?)`
  )
  const params = arms.flatMap((arm) => [...arm.params, cursorAt, cursorAt, cursorAt, cursorKey, limit + 1])
  const rows = all<FeedRow>(`${parts.join(" UNION ALL ")} ORDER BY sort_at DESC, key DESC LIMIT ?`, ...params, limit + 1)
  return pageOf(rows, limit, viewerId, postFilter)
}

const FOLLOWING = "SELECT followee_id FROM follows WHERE follower_id = ?"

// For you is ranked (lib/ranking.ts). The candidates come from eight pools, each read from its own index:
//   follow    the newest posts of people the viewer follows
//   repost    reposts by people the viewer follows
//   social    posts that people the viewer follows liked in the last three days
//   affinity  the recent posts of authors the viewer has liked, reposted or bookmarked lately
//   topic     recent posts that use a hashtag the viewer follows
//   popular   the most engaged posts of the last three days
//   explore   posts from the last day by authors with few followers, so new people get seen too
//   fresh     the newest posts from anyone
// A post that several pools found is kept once, under the first pool that found it. The ranking is made at a snapshot time,
// which the cursor carries as "r1:<time>:<offset>", so the pages agree with each other while the reader scrolls. A ranking is
// kept for ten minutes per viewer in this process. Each page leaves out the posts the viewer marked "Not interested", and
// records what it showed (lib/feed-learning.ts), which is what the models learn from.
const POOL_SIZE = { follow: 200, repost: 100, social: 150, affinity: 150, topic: 100, popular: 100, explore: 60, fresh: 300 }
const FOR_YOU_SIZE = 400
const AFFINITY_AUTHORS = 30
const AFFINITY_MS = 30 * 24 * 60 * 60 * 1000
const TOPIC_TAGS = 40
const EXPLORE_MS = 24 * 60 * 60 * 1000
const RANKED_TTL_MS = 10 * 60 * 1000
const RANKED_KEEP = 600
// A refresh of For you within this window reuses the viewer's latest ranking instead of running the queries again.
const RANKED_REUSE_MS = 60 * 1000
const rankedCache = new Map<string, { made: number; list: Candidate[] }>()
const latestRanking = new Map<string, { at: number; made: number }>()

type CandidatePost = {
  post_id: string
  body: string
  author_id: string
  created_at: number
  likes: number
  reposted: number
  replies: number
  quotes: number
  views: number
  author_followers: number
}

const CANDIDATE_COLUMNS = `p.id AS post_id, p.body, p.author_id, p.created_at, p.likes_count AS likes,
  p.reposts_count AS reposted, p.replies_count AS replies, p.quotes_count AS quotes, p.views_count AS views,
  au.followers_count AS author_followers`
// A post that a check has limited or held stays out of For you. A held post is also hidden, so this covers limited ones.
const NOT_RESTRICTED = "NOT EXISTS (SELECT 1 FROM post_risk pr WHERE pr.post_id = p.id AND pr.action <> 'allow')"

// Of these posts, the ones this viewer has liked, reposted or bookmarked.
function engagedWith(viewerId: string, postIds: string[]): Set<string> {
  const found = new Set<string>()
  for (let i = 0; i < postIds.length; i += 500) {
    const chunk = postIds.slice(i, i + 500)
    const marks = chunk.map(() => "?").join(", ")
    const rows = all<{ post_id: string }>(
      `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${marks})
       UNION SELECT post_id FROM reposts WHERE user_id = ? AND post_id IN (${marks})
       UNION SELECT post_id FROM bookmarks WHERE user_id = ? AND post_id IN (${marks})`,
      viewerId,
      ...chunk,
      viewerId,
      ...chunk,
      viewerId,
      ...chunk
    )
    for (const row of rows) found.add(row.post_id)
  }
  return found
}

type Pooled = { row: CandidatePost; key: string; at: number; reposterId: string | null; source: Source; followed: boolean }

function rankCandidates(viewerId: string, at: number): Candidate[] {
  const since = at - RANK_WINDOW_MS
  const vis = visibilityClause(viewerId)
  const tags = followedTopics(viewerId).slice(0, TOPIC_TAGS)
  const tagSet = new Set(tags)
  const followed = new Set(all<{ followee_id: string }>(FOLLOWING, viewerId).map((r) => r.followee_id))

  // The authors this viewer has engaged with lately, most engaged first. It feeds the affinity pool and a feature.
  const affinityRows = all<{ author_id: string; n: number }>(
    `SELECT p.author_id, COUNT(*) AS n FROM (
       SELECT post_id FROM likes WHERE user_id = ? AND created_at >= ?
       UNION ALL SELECT post_id FROM reposts WHERE user_id = ? AND created_at >= ?
       UNION ALL SELECT post_id FROM bookmarks WHERE user_id = ? AND created_at >= ?
     ) e JOIN posts p ON p.id = e.post_id
     WHERE p.author_id <> ?
     GROUP BY p.author_id ORDER BY n DESC LIMIT ?`,
    viewerId,
    at - AFFINITY_MS,
    viewerId,
    at - AFFINITY_MS,
    viewerId,
    at - AFFINITY_MS,
    viewerId,
    AFFINITY_AUTHORS
  )
  const affinity = new Map(affinityRows.map((r) => [r.author_id, r.n] as const))

  // Posts that people the viewer follows liked, and how many of them liked each one.
  const socialRows = all<CandidatePost & { social_count: number }>(
    `SELECT ${CANDIDATE_COLUMNS}, COUNT(DISTINCT l.user_id) AS social_count
     FROM likes l JOIN posts p ON p.id = l.post_id JOIN users au ON au.id = p.author_id
     WHERE l.user_id IN (${FOLLOWING}) AND l.created_at >= ? AND l.created_at <= ?
       AND p.author_id <> ? AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
     GROUP BY p.id ORDER BY social_count DESC, MAX(l.created_at) DESC LIMIT ?`,
    viewerId,
    since,
    at,
    viewerId,
    ...vis.params,
    POOL_SIZE.social
  )
  const socialCount = new Map(socialRows.map((r) => [r.post_id, r.social_count] as const))

  // Posts from people the viewer follows are always candidates, even when the newest pool is full of strangers.
  const followRows = all<CandidatePost>(
    `SELECT ${CANDIDATE_COLUMNS} FROM posts p JOIN users au ON au.id = p.author_id
     WHERE p.created_at >= ? AND p.created_at <= ? AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
       AND p.author_id IN (${FOLLOWING})
     ORDER BY p.created_at DESC LIMIT ?`,
    since,
    at,
    ...vis.params,
    viewerId,
    POOL_SIZE.follow
  )
  // Reposts by people the viewer follows, with the same blocks and mutes that the Following feed applies to a reposter.
  const repostRows = all<CandidatePost & { reposter_id: string; reposted_at: number }>(
    `SELECT ${CANDIDATE_COLUMNS}, r.user_id AS reposter_id, r.created_at AS reposted_at
     FROM reposts r INDEXED BY reposts_created JOIN posts p ON p.id = r.post_id JOIN users au ON au.id = p.author_id
     WHERE r.created_at >= ? AND r.created_at <= ? AND r.user_id IN (${FOLLOWING}) AND ${vis.sql} AND ${NOT_RESTRICTED}
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = r.user_id) OR (b.blocker_id = r.user_id AND b.blocked_id = ?))
       AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = ? AND m.muted_id = r.user_id)
     ORDER BY r.created_at DESC LIMIT ?`,
    since,
    at,
    viewerId,
    ...vis.params,
    viewerId,
    viewerId,
    viewerId,
    POOL_SIZE.repost
  )
  const affinityAuthors = affinityRows.map((r) => r.author_id)
  const affinityPosts =
    affinityAuthors.length === 0
      ? []
      : all<CandidatePost>(
          `SELECT ${CANDIDATE_COLUMNS} FROM posts p JOIN users au ON au.id = p.author_id
           WHERE p.author_id IN (${affinityAuthors.map(() => "?").join(", ")}) AND p.created_at >= ? AND p.created_at <= ?
             AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
           ORDER BY p.created_at DESC LIMIT ?`,
          ...affinityAuthors,
          since,
          at,
          ...vis.params,
          POOL_SIZE.affinity
        )
  // The instr test is a cheap first cut. The exact hashtag check (extractHashtags) runs on the rows it returns.
  const topicPosts =
    tags.length === 0
      ? []
      : all<CandidatePost>(
          `SELECT ${CANDIDATE_COLUMNS} FROM posts p JOIN users au ON au.id = p.author_id
           WHERE p.created_at >= ? AND p.created_at <= ? AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
             AND (${tags.map(() => "instr(lower(p.body), ?) > 0").join(" OR ")})
           ORDER BY p.created_at DESC LIMIT ?`,
          since,
          at,
          ...vis.params,
          ...tags.map((tag) => `#${tag}`.toLowerCase()),
          POOL_SIZE.topic
        )
  const popularPosts = all<CandidatePost>(
    `SELECT ${CANDIDATE_COLUMNS} FROM posts p JOIN users au ON au.id = p.author_id
     WHERE p.created_at >= ? AND p.created_at <= ? AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
     ORDER BY (p.likes_count + 2 * p.reposts_count + 2 * p.quotes_count + 1.5 * p.replies_count) DESC, p.created_at DESC
     LIMIT ?`,
    since,
    at,
    ...vis.params,
    POOL_SIZE.popular
  )
  const explorePosts = all<CandidatePost>(
    `SELECT ${CANDIDATE_COLUMNS} FROM posts p JOIN users au ON au.id = p.author_id
     WHERE p.created_at >= ? AND p.created_at <= ? AND au.followers_count < ? AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
     ORDER BY p.created_at DESC LIMIT ?`,
    at - EXPLORE_MS,
    at,
    SMALL_AUTHOR,
    ...vis.params,
    POOL_SIZE.explore
  )
  const freshPosts = all<CandidatePost>(
    `SELECT ${CANDIDATE_COLUMNS} FROM posts p INDEXED BY posts_created JOIN users au ON au.id = p.author_id
     WHERE p.created_at >= ? AND p.created_at <= ? AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
     ORDER BY p.created_at DESC LIMIT ?`,
    since,
    at,
    ...vis.params,
    POOL_SIZE.fresh
  )

  // Pools in priority order. A key found earlier keeps its source.
  const pooled = new Map<string, Pooled>()
  const addPosts = (rows: CandidatePost[], source: Source) => {
    for (const row of rows) {
      const key = `post:${row.post_id}`
      if (!pooled.has(key)) pooled.set(key, { row, key, at: row.created_at, reposterId: null, source, followed: followed.has(row.author_id) })
    }
  }
  addPosts(followRows, "follow")
  for (const row of repostRows) {
    const key = `repost:${row.post_id}:${row.reposter_id}`
    if (!pooled.has(key)) pooled.set(key, { row, key, at: row.reposted_at, reposterId: row.reposter_id, source: "repost", followed: true })
  }
  addPosts(socialRows, "social")
  addPosts(affinityPosts, "affinity")
  addPosts(
    topicPosts.filter((row) => extractHashtags(row.body).some((tag) => tagSet.has(tag))),
    "topic"
  )
  addPosts(popularPosts, "popular")
  addPosts(explorePosts, "explore")
  addPosts(freshPosts, "fresh")

  const postIds = [...new Set([...pooled.values()].map((p) => p.row.post_id))]
  const engaged = engagedWith(viewerId, postIds)
  const served = recentlyServed(viewerId, since)
  const dwell = dwellSince(viewerId, since)
  const candidates = [...pooled.values()].map(
    ({ row, key, at: itemAt, reposterId, source, followed: byFollowed }): Candidate => ({
      key,
      postId: row.post_id,
      authorId: row.author_id,
      at: itemAt,
      reposterId,
      source,
      followed: byFollowed,
      topic: extractHashtags(row.body).some((tag) => tagSet.has(tag)),
      likes: row.likes,
      reposted: row.reposted,
      replies: row.replies,
      quotes: row.quotes,
      views: row.views,
      socialCount: socialCount.get(row.post_id) ?? 0,
      affinity: affinity.get(row.author_id) ?? 0,
      authorFollowers: row.author_followers,
      links: /https?:\/\//i.test(row.body),
      length: row.body.length,
      seen: served.has(row.post_id),
      dwelledMs: dwell.get(row.post_id) ?? 0,
      engagedByViewer: engaged.has(row.post_id),
    })
  )
  return rank(candidates, at, FOR_YOU_SIZE, modelWeights())
}

function rankedFor(viewerId: string, at: number): Candidate[] {
  const cacheKey = `${viewerId}|${at}`
  const hit = rankedCache.get(cacheKey)
  if (hit && Date.now() - hit.made < RANKED_TTL_MS) return hit.list
  const list = rankCandidates(viewerId, at)
  rankedCache.set(cacheKey, { made: Date.now(), list })
  if (rankedCache.size > RANKED_KEEP) {
    const oldest = rankedCache.keys().next().value
    if (oldest !== undefined) rankedCache.delete(oldest)
  }
  return list
}

function parseRankedCursor(cursor: string | undefined): { at: number; offset: number } | null {
  if (!cursor?.startsWith("r1:")) return null
  const [, atText = "", offsetText = ""] = cursor.split(":")
  const at = Number(atText)
  const offset = Number(offsetText)
  if (!Number.isFinite(at) || !Number.isInteger(offset) || offset < 0) return null
  return { at, offset }
}

// The viewer's own posts from the last hour lead the first page of For you, newest first, as on X, so a new post is
// seen straight away. Ranking decides the rest of the feed, and these posts are kept out of it so none repeats.
const OWN_POST_MS = 60 * 60 * 1000
const OWN_POST_LIMIT = 3

function ownRecentPosts(viewerId: string, now: number): CandidatePost[] {
  const vis = visibilityClause(viewerId)
  return all<CandidatePost>(
    `SELECT ${CANDIDATE_COLUMNS} FROM posts p JOIN users au ON au.id = p.author_id
     WHERE p.author_id = ? AND p.created_at >= ? AND p.created_at <= ? AND ${AUTHORED} AND ${vis.sql} AND ${NOT_RESTRICTED}
     ORDER BY p.created_at DESC LIMIT ?`,
    viewerId,
    now - OWN_POST_MS,
    now,
    ...vis.params,
    OWN_POST_LIMIT
  )
}

// The snapshot time a first page ranks at. The viewer's latest ranking is reused while it is under a minute old, so a
// refresh costs one small query rather than the whole ranking. The cursor carries the time, so the pages still agree.
function snapshotFor(viewerId: string, now: number): number {
  const latest = latestRanking.get(viewerId)
  if (latest && now - latest.made < RANKED_REUSE_MS) return latest.at
  latestRanking.delete(viewerId)
  latestRanking.set(viewerId, { at: now, made: now })
  if (latestRanking.size > RANKED_KEEP) {
    const oldest = latestRanking.keys().next().value
    if (oldest !== undefined) latestRanking.delete(oldest)
  }
  return now
}

function forYouPage(viewerId: string, cursor: string | undefined, limit: number): Page<FeedItem> {
  const resume = parseRankedCursor(cursor)
  const now = Date.now()
  const at = resume?.at ?? snapshotFor(viewerId, now)
  const offset = resume?.offset ?? 0
  const hidden = hiddenPosts(viewerId)
  // A first page looks up the viewer's own new posts up to now, so they show at once even when the ranking is reused.
  const own = ownRecentPosts(viewerId, resume ? at : now).filter((post) => !hidden.has(post.post_id))
  const ownIds = new Set(own.map((post) => post.post_id))
  const ranked = rankedFor(viewerId, at).filter((c) => !hidden.has(c.postId) && !ownIds.has(c.postId))
  const slice = ranked.slice(offset, offset + limit)
  recordImpressions(
    viewerId,
    slice.map((c) => ({ postId: c.postId, source: c.source, features: featuresOf(c, at) })),
    Date.now()
  )
  const lead: FeedRow[] = offset === 0
    ? own.map((post) => ({ key: `post:${post.post_id}`, post_id: post.post_id, sort_at: post.created_at, reposter_id: null, folder_id: null }))
    : []
  const rows: FeedRow[] = [
    ...lead,
    ...slice.map((c) => ({
      key: c.key,
      post_id: c.postId,
      sort_at: c.at,
      reposter_id: c.reposterId,
      folder_id: null,
    })),
  ]
  const end = offset + slice.length
  return { items: pageOf(rows, rows.length, viewerId).items, next: end < ranked.length ? `r1:${at}:${end}` : null }
}

// Following: the viewer's own posts, posts and reposts from accounts they follow, and
// posts that use a hashtag they follow. Every row still passes the feed's visibility rules.
export function homeFeed(mode: "for-you" | "following", viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const vis = visibilityClause(viewerId)
  // A post arm: `where` is the arm's own condition, placed before the visibility rules.
  const postArm = (where: string, params: Param[]): Arm => ({
    from: "posts p INDEXED BY posts_created JOIN users au ON au.id = p.author_id",
    where: `${where} AND ${vis.sql}`,
    params: [...params, ...vis.params],
    key: "'post:' || p.id",
    postId: "p.id",
    sortAt: "p.created_at",
    reposter: "NULL",
  })
  // A repost arm: a repost by someone the viewer has not blocked or muted, of a post the viewer may see.
  const repostArm = (where: string, params: Param[]): Arm => ({
    from: "reposts r INDEXED BY reposts_created JOIN posts p ON p.id = r.post_id JOIN users au ON au.id = p.author_id",
    where: `${where} AND ${vis.sql}
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = r.user_id) OR (b.blocker_id = r.user_id AND b.blocked_id = ?))
      AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = ? AND m.muted_id = r.user_id)`,
    params: [...params, ...vis.params, viewerId, viewerId, viewerId],
    key: "'repost:' || r.post_id || ':' || r.user_id",
    postId: "r.post_id",
    sortAt: "r.created_at",
    reposter: "r.user_id",
  })

  if (mode === "for-you") return forYouPage(viewerId, cursor, limit)

  const tags = new Set(followedTopics(viewerId))
  const arms: Arm[] = [
    postArm(`${AUTHORED} AND (p.author_id = ? OR p.author_id IN (${FOLLOWING}))`, [viewerId, viewerId]),
    repostArm(`(r.user_id = ? OR r.user_id IN (${FOLLOWING}))`, [viewerId, viewerId]),
  ]
  if (tags.size === 0) return timelinePage(arms, cursor, limit, viewerId)

  // Posts that use a followed #tag, from accounts the viewer does not follow. SQL finds a substring; a tag that only
  // starts the same way (#art in #artist) is dropped afterwards by reading the post's hashtags exactly.
  arms.push(
    postArm(
      `${AUTHORED} AND p.author_id <> ? AND p.author_id NOT IN (${FOLLOWING})
       AND EXISTS (SELECT 1 FROM topic_follows tf WHERE tf.user_id = ? AND instr(lower(p.body), '#' || tf.tag) > 0)`,
      [viewerId, viewerId, viewerId]
    )
  )
  const followed = new Set(all<{ followee_id: string }>(FOLLOWING, viewerId).map((r) => r.followee_id))
  return timelinePage(arms, cursor, limit, viewerId, (post, row) =>
    row.reposter_id !== null ||
    post.author.id === viewerId ||
    followed.has(post.author.id) ||
    extractHashtags(post.body).some((tag) => tags.has(tag))
  )
}

// "highlights" is a feed of its own, shown inside the Posts section of a profile.
export type ProfileTab = "posts" | "highlights" | "replies" | "media" | "reposts" | "likes"

// Each tab is one arm of the timeline, reading the index of its own table in time order.
export function profileFeed(tab: ProfileTab, userId: string, viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const vis = visibilityClause(viewerId)
  const byAuthor = "posts p INDEXED BY posts_author JOIN users au ON au.id = p.author_id"
  let arm: Arm
  switch (tab) {
    case "replies":
      arm = {
        from: byAuthor,
        where: `p.author_id = ? AND p.reply_to_id IS NOT NULL AND p.thread_id IS NULL AND ${vis.sql}`,
        params: [userId, ...vis.params],
        key: "'post:' || p.id",
        postId: "p.id",
        sortAt: "p.created_at",
        reposter: "NULL",
      }
      break
    case "media":
      arm = {
        from: byAuthor,
        where: `p.author_id = ? AND EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id) AND ${vis.sql}`,
        params: [userId, ...vis.params],
        key: "'post:' || p.id",
        postId: "p.id",
        sortAt: "p.created_at",
        reposter: "NULL",
      }
      break
    case "likes":
      arm = {
        from: "likes l INDEXED BY likes_user JOIN posts p ON p.id = l.post_id JOIN users au ON au.id = p.author_id",
        where: `l.user_id = ? AND ${vis.sql}`,
        params: [userId, ...vis.params],
        key: "'like:' || l.post_id || ':' || l.user_id",
        postId: "l.post_id",
        sortAt: "l.created_at",
        reposter: "NULL",
      }
      break
    case "highlights":
      arm = {
        from: "highlights h JOIN posts p ON p.id = h.post_id JOIN users au ON au.id = p.author_id",
        where: `h.user_id = ? AND ${vis.sql}`,
        params: [userId, ...vis.params],
        key: "'highlight:' || h.post_id",
        postId: "h.post_id",
        sortAt: "h.created_at",
        reposter: "NULL",
      }
      break
    case "reposts":
      arm = {
        from: "reposts r INDEXED BY reposts_user JOIN posts p ON p.id = r.post_id JOIN users au ON au.id = p.author_id",
        where: `r.user_id = ? AND ${vis.sql}`,
        params: [userId, ...vis.params],
        key: "'repost:' || r.post_id || ':' || r.user_id",
        postId: "r.post_id",
        sortAt: "r.created_at",
        reposter: "r.user_id",
      }
      break
    default:
      // Original posts only: reposts have their own tab, and the pinned post is shown above the list.
      arm = {
        from: byAuthor,
        where: `p.author_id = ? AND ${AUTHORED} AND p.id IS NOT (SELECT pinned_post_id FROM users WHERE id = ?) AND ${vis.sql}`,
        params: [userId, userId, ...vis.params],
        key: "'post:' || p.id",
        postId: "p.id",
        sortAt: "p.created_at",
        reposter: "NULL",
      }
  }
  return timelinePage([arm], cursor, limit, viewerId)
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
    FROM posts p WHERE ${AUTHORED} AND p.author_id IN (${members})
    UNION ALL
    SELECT 'repost:' || r.post_id || ':' || r.user_id AS key, r.post_id AS post_id, r.created_at AS sort_at, r.user_id AS reposter_id, NULL AS folder_id
    FROM reposts r WHERE r.user_id IN (${members})`
  return feedPage(source, [listId, listId], cursor, limit, viewerId)
}

// The posts written in a circle, newest first. Replies stay in the thread they are part of, so only original posts and
// thread continuations are listed. The visibility rule then decides which of them this viewer can see.
export function circleFeed(circleId: string, viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p WHERE ${AUTHORED} AND p.community_id = ?`
  return feedPage(source, [circleId], cursor, limit, viewerId)
}

export function topicFeed(tag: string, viewerId: string, cursor?: string, limit = 25): Page<FeedItem> {
  const normalized = normalizeTag(tag)
  const source = `
    SELECT 'post:' || p.id AS key, p.id AS post_id, p.created_at AS sort_at, NULL AS reposter_id, NULL AS folder_id
    FROM posts p WHERE lower(p.body) LIKE ? ESCAPE '\\' AND ${AUTHORED}`
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
    const match = termClause(term)
    clauses.push(match.sql)
    params.push(match.param)
  }
  if (query.from) {
    clauses.push("au.handle = ? COLLATE NOCASE")
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
    clauses.push("p.likes_count >= ?")
    params.push(query.minLikes)
  }
  if (query.minReposts !== null) {
    clauses.push("p.reposts_count >= ?")
    params.push(query.minReposts)
  }
  if (query.filter === "replies") clauses.push("p.reply_to_id IS NOT NULL AND p.thread_id IS NULL")
  if (query.filter === "links") clauses.push(`p.search_id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH '"http"')`)
  if (query.filter === "media") clauses.push("EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)")
  if (query.filter === "images") clauses.push("EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.kind = 'image')")
  if (query.filter === "videos") clauses.push("EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.kind = 'video')")
  // Top is engagement: likes, plus twice the reposts, plus replies. It is kept on the post, so sorting reads a column.
  // Each sort reads its own index in order, so a page stops after its rows instead of sorting every match.
  const vis = visibilityClause(viewerId)
  const top = sort === "top"
  const arm: Arm = {
    from: `posts p INDEXED BY ${top ? "posts_engagement" : "posts_created"} JOIN users au ON au.id = p.author_id`,
    where: `${clauses.join(" AND ")} AND ${vis.sql}`,
    params: [...params, ...vis.params],
    key: "'post:' || p.id",
    postId: "p.id",
    sortAt: top ? "p.engagement" : "p.created_at",
    reposter: "NULL",
  }
  return timelinePage([arm], cursor, limit, viewerId)
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
  // An active paid verification subscription. It makes no identity claim.
  paidVerified: boolean
  bot: boolean
  protected: boolean
  deactivated: boolean
  pinnedPostId: string | null
  birthday: string | null
  relationship: Relationship
  // The viewer asked to hear about every new post from this account.
  notifying: boolean
  // The languages this person speaks, with a level, and the ones they are learning. Shown to everyone, so people can find a
  // language partner. Where they are is never shown.
  languages: { speak: { code: string; level: string }[]; learn: string[] }
}

function profileLanguages(userId: string): ProfileView["languages"] {
  const rows = all<{ code: string; kind: string; level: string }>(
    "SELECT code, kind, level FROM user_languages WHERE user_id = ? ORDER BY rowid",
    userId
  )
  return {
    speak: rows.filter((row) => row.kind === "speak").map((row) => ({ code: row.code, level: row.level })),
    learn: rows.filter((row) => row.kind === "learn").map((row) => row.code),
  }
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
    paid_verified: number
    bot: number
    protected: number
    deactivated_at: number | null
    pinned_post_id: string | null
    birthday: string | null
    followers: number
    following: number
    posts: number
  }>(
    `SELECT u.id, u.handle, u.name, u.bio, u.location, u.website, u.avatar_file, u.banner_file, u.status, u.created_at,
       u.verified, u.paid_verified, u.bot, u.protected, u.deactivated_at, u.pinned_post_id, u.birthday,
       u.followers_count AS followers, u.following_count AS following, u.posts_count AS posts
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
    paidVerified: row.paid_verified === 1,
  bot: row.bot === 1,
    protected: row.protected === 1,
    deactivated: row.deactivated_at !== null,
    pinnedPostId: row.pinned_post_id,
    birthday: isSelf ? row.birthday : null,
    relationship,
    notifying: !isSelf && get("SELECT 1 AS found FROM post_subscriptions WHERE user_id = ? AND author_id = ?", viewerId, row.id) !== undefined,
    languages: profileLanguages(row.id),
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
     ORDER BY u.followers_count DESC, u.created_at DESC
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
     ORDER BY u.followers_count DESC, u.created_at DESC
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

export type PeopleOfPage = { users: UserCard[]; next: number | null }

// Followers or following for one account, newest follow first, one page at a time. `beforeAt` is the `next` of the
// previous page (a follow date); null starts at the newest. The account's own visibility applies: nothing for a
// deactivated account or one that blocked the viewer, and a protected account's lists only for its followers.
export function peopleOfPage(
  kind: "followers" | "following",
  userId: string,
  viewerId: string,
  beforeAt: number | null,
  limit = PEOPLE_PAGE_SIZE
): PeopleOfPage {
  const empty: PeopleOfPage = { users: [], next: null }
  if (beforeAt !== null && !Number.isFinite(beforeAt)) return empty
  const owner = get<{ protected: number; deactivated_at: number | null }>("SELECT protected, deactivated_at FROM users WHERE id = ?", userId)
  if (!owner) return empty
  if (userId !== viewerId) {
    if (owner.deactivated_at !== null) return empty
    if (get("SELECT 1 AS found FROM blocks WHERE blocker_id = ? AND blocked_id = ?", userId, viewerId)) return empty
    if (owner.protected === 1 && !get("SELECT 1 AS found FROM follows WHERE follower_id = ? AND followee_id = ?", viewerId, userId)) return empty
  }
  const join = kind === "followers" ? "f.follower_id = u.id AND f.followee_id = ?" : "f.followee_id = u.id AND f.follower_id = ?"
  const select = `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, u.bio,
       EXISTS(SELECT 1 FROM follows x WHERE x.follower_id = ? AND x.followee_id = u.id) AS following,
       EXISTS(SELECT 1 FROM follows x WHERE x.follower_id = u.id AND x.followee_id = ?) AS follows_me,
       f.created_at AS followed_at
     FROM users u
     JOIN follows f ON ${join}
     WHERE ${NOT_HIDDEN}`
  const size = Math.min(Math.max(Math.floor(limit), 1), 200)
  const { rows, next } = pageBefore<CardRow & { followed_at: number }>(
    select,
    [viewerId, viewerId, userId, viewerId, viewerId],
    "f.created_at",
    "u.id",
    (r) => r.followed_at,
    beforeAt,
    size
  )
  return { users: rows.map(toCard), next }
}

export function followRequestsFor(viewerId: string): (MiniUser & { createdAt: number })[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number; created_at: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified, fr.created_at
     FROM follow_requests fr JOIN users u ON u.id = fr.requester_id
     WHERE fr.target_id = ? ORDER BY fr.created_at DESC`,
    viewerId
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1, createdAt: r.created_at }))
}

// Hashtags used most in the last week, counted from live posts by active accounts. Every page shows them, so the
// count is kept until a new post arrives or a minute passes. A post shows up at once: the newest post's id changes.
let trending: { generation: number; at: number; tags: { tag: string; count: number }[] } | null = null
const TRENDING_TTL_MS = 60 * 1000

export function trendingTags(limit = 6): { tag: string; count: number }[] {
  const now = Date.now()
  const generation = get<{ generation: number | null }>("SELECT MAX(search_id) AS generation FROM posts")?.generation ?? 0
  if (!trending || trending.generation !== generation || now - trending.at > TRENDING_TTL_MS) {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const rows = all<{ body: string }>(
      `SELECT p.body FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.created_at > ? AND ${LIVE} AND u.deactivated_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM communities c WHERE c.id = p.community_id AND c.access = 'closed')
       ORDER BY p.created_at DESC LIMIT 2000`,
      weekAgo
    )
    const counts = new Map<string, number>()
    for (const row of rows) {
      for (const tag of extractHashtags(row.body)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    const tags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }))
    trending = { generation, at: now, tags }
  }
  return trending.tags.slice(0, limit)
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

// The notifications a person's list shows (alias n, with the actor as u): from active accounts, with no block either
// way and no mute from the recipient. The unread badge counts the same rows.
const SHOWN_NOTIFICATION = `n.recipient_id = ?
  AND u.deactivated_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = n.recipient_id AND b.blocked_id = n.actor_id) OR (b.blocker_id = n.actor_id AND b.blocked_id = n.recipient_id))
  AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.muter_id = n.recipient_id AND m.muted_id = n.actor_id)`

type NotificationRow = {
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
}

export type NotificationPage = { items: NotificationView[]; next: number | null }

// Notifications newest first, older than `beforeAt` (a created_at from the previous page's `next`; null for the first
// page). A post's text is included only when the recipient can see that post; otherwise `post` is null.
export function notificationsPage(
  viewerId: string,
  filter: "all" | "mentions",
  beforeAt: number | null,
  limit = NOTIFICATION_PAGE_SIZE
): NotificationPage {
  const kinds = filter === "mentions" ? "AND n.kind IN ('mention', 'reply', 'quote')" : ""
  const select = `SELECT n.id, n.kind, n.created_at, n.read, n.post_id, pst.body AS post_body,
       u.id AS actor_id, u.handle AS actor_handle, u.name AS actor_name, u.avatar_file AS actor_avatar, u.verified AS actor_verified
     FROM notifications n
     JOIN users u ON u.id = n.actor_id
     LEFT JOIN posts pst ON pst.id = n.post_id
     WHERE ${SHOWN_NOTIFICATION} ${kinds}`
  const { rows, next } = pageBefore<NotificationRow>(select, [viewerId], "n.created_at", "n.id", (r) => r.created_at, beforeAt, limit)
  const visible = visiblePostIds(
    rows.flatMap((r) => (r.post_id ? [r.post_id] : [])),
    viewerId
  )
  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    actor: { id: r.actor_id, handle: r.actor_handle, name: r.actor_name, avatarFile: r.actor_avatar, verified: r.actor_verified === 1 },
    post: r.post_id && r.post_body !== null && visible.has(r.post_id) ? { id: r.post_id, body: r.post_body } : null,
    createdAt: r.created_at,
    read: r.read === 1,
  }))
  return { items, next }
}

export function unreadNotificationCount(viewerId: string): number {
  return (
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM notifications n JOIN users u ON u.id = n.actor_id WHERE ${SHOWN_NOTIFICATION} AND n.read = 0`,
      viewerId
    )?.c ?? 0
  )
}

// `departed` marks someone who has left a direct conversation (a declined request, say). They are still named there,
// because their messages stay in the thread, but they can no longer receive anything in it.
export type ChatMemberView = MiniUser & { status: "accepted" | "requested"; lastReadAt: number; departed?: boolean }

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

type LastMessage = {
  body: string
  sender_id: string
  created_at: number
  deleted_at: number | null
  media_file: string | null
  post_id: string | null
  call_status: CallOutcome | null
  call_seconds: number
  call_kind: "dm" | "group"
  call_people: number
}

function lastMessageOf(conversationId: string): LastMessage | undefined {
  return get<LastMessage>(
    `SELECT body, sender_id, created_at, deleted_at, media_file, post_id, call_status, call_seconds, call_kind, call_people FROM chat_messages
     WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    conversationId
  )
}

// What the conversation list says about the latest message, from the viewer's side.
function previewOfLast(last: LastMessage | undefined, viewerId: string): string {
  if (!last || last.deleted_at) return ""
  if (last.call_status) {
    return callSummary(last.call_status, last.call_seconds, last.sender_id === viewerId, last.call_kind, last.call_people)
  }
  if (last.media_file) return isVoiceFile(last.media_file) ? "Sent a voice message" : "Sent a photo"
  return last.body || (last.post_id ? "Shared a post" : "")
}

// A one-to-one conversation (alias c) where the viewer and the other person have blocked each other, in either
// direction. Such a conversation stays out of the viewer's lists and can't be opened. Groups are unaffected. It takes
// the viewer's id three times.
const DM_BLOCKED = `c.kind = 'dm' AND EXISTS (
  SELECT 1 FROM conversation_members o JOIN blocks b
    ON (b.blocker_id = ? AND b.blocked_id = o.user_id) OR (b.blocker_id = o.user_id AND b.blocked_id = ?)
  WHERE o.conversation_id = c.id AND o.user_id <> ?)`

// Whether the viewer may read a conversation: they are a member of it, and it isn't a one-to-one chat with someone
// either of them has blocked.
export function canReadConversation(conversationId: string, viewerId: string): boolean {
  return (
    get(
      `SELECT 1 AS found FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       WHERE c.id = ? AND NOT (${DM_BLOCKED})`,
      viewerId,
      conversationId,
      viewerId,
      viewerId,
      viewerId
    ) !== undefined
  )
}

// People who have left a conversation and are no longer in it: anyone who wrote in it, and anyone who declined or left.
// Only a direct conversation names them afterwards.
function departedMembers(conversationId: string, currentIds: string[]): MiniUser[] {
  const present = new Set(currentIds)
  const ids = new Set<string>(
    all<{ user_id: string }>("SELECT user_id FROM conversation_departures WHERE conversation_id = ?", conversationId).map((row) => row.user_id)
  )
  for (const row of all<{ sender_id: string }>(
    "SELECT DISTINCT sender_id FROM chat_messages WHERE conversation_id = ? AND deleted_at IS NULL",
    conversationId
  )) {
    ids.add(row.sender_id)
  }
  return [...loadMiniUsers([...ids].filter((id) => !present.has(id))).values()]
}

export function conversationSummaries(viewerId: string, status: "accepted" | "requested", limit = 60): ConversationSummary[] {
  const rows = all<{ id: string; kind: "dm" | "group"; title: string; updated_at: number; last_read_at: number }>(
    `SELECT c.id, c.kind, c.title, c.updated_at, cm.last_read_at
     FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.user_id = ? AND cm.status = ? AND NOT (${DM_BLOCKED})
     ORDER BY c.updated_at DESC LIMIT ?`,
    viewerId,
    status,
    viewerId,
    viewerId,
    viewerId,
    limit
  )
  return rows.map((row) => {
    const members = all<{ user_id: string }>(
      "SELECT user_id FROM conversation_members WHERE conversation_id = ?",
      row.id
    ).map((m) => m.user_id)
    const users = loadMiniUsers(members)
    const others = members.filter((id) => id !== viewerId).map((id) => users.get(id)).filter((u): u is MiniUser => Boolean(u))
    if (row.kind === "dm") others.push(...departedMembers(row.id, members).filter((u) => u.id !== viewerId))
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
      lastBody: previewOfLast(last, viewerId),
      lastAt: last?.created_at ?? row.updated_at,
      lastFromMe: last?.sender_id === viewerId,
      lastDeleted: Boolean(last?.deleted_at),
      unread,
      status,
    }
  })
}

// Unread messages across the conversations the list shows, so the badge never counts a hidden conversation.
export function unreadMessageCount(viewerId: string): number {
  return (
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM chat_messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
       JOIN conversations c ON c.id = m.conversation_id
       WHERE cm.status = 'accepted' AND cm.muted = 0 AND m.sender_id <> ? AND m.created_at > cm.last_read_at AND m.deleted_at IS NULL
         AND NOT (${DM_BLOCKED})`,
      viewerId,
      viewerId,
      viewerId,
      viewerId,
      viewerId
    )?.c ?? 0
  )
}

export function requestCount(viewerId: string): number {
  return (
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
       WHERE cm.user_id = ? AND cm.status = 'requested' AND NOT (${DM_BLOCKED})`,
      viewerId,
      viewerId,
      viewerId,
      viewerId
    )?.c ?? 0
  )
}

// People the viewer chats with one to one, most recent first. The share sheet offers them before a search.
export function recentChatPartners(viewerId: string, limit = 6): MiniUser[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified
     FROM conversations c
     JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = ? AND me.status = 'accepted'
     JOIN conversation_members them ON them.conversation_id = c.id AND them.user_id <> ? AND them.status = 'accepted'
     JOIN users u ON u.id = them.user_id
     WHERE c.kind = 'dm' AND u.deactivated_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
     ORDER BY c.updated_at DESC LIMIT ?`,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    limit
  ).map((r) => ({ id: r.id, handle: r.handle, name: r.name, avatarFile: r.avatar_file, verified: r.verified === 1 }))
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

// The conversation, if the viewer is a member and it isn't a one-to-one chat across a block. Null otherwise.
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
     WHERE c.id = ? AND NOT (${DM_BLOCKED})`,
    viewerId,
    id,
    viewerId,
    viewerId,
    viewerId
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
  if (base.kind === "dm") {
    for (const user of departedMembers(id, rows.map((r) => r.user_id))) {
      if (user.id !== viewerId) members.push({ ...user, status: "accepted", lastReadAt: 0, departed: true })
    }
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
  // The language the text is written in, or "" when it is not clear.
  lang: string
  deleted: boolean
  mediaFile: string | null
  // A shared post the viewer may see. When the viewer may not see it, `post` is null and `postUnavailable` is true.
  post: PostView | null
  postUnavailable: boolean
  // A call that ended, was missed or declined. Calls sit in the thread like messages.
  call: { outcome: CallOutcome; seconds: number; kind: "dm" | "group"; people: number } | null
  // The message this one answers, when that message is in the same chat. `deleted` means it was taken back since.
  replyTo: { id: string; senderName: string; snippet: string; deleted: boolean } | null
  createdAt: number
  seen: boolean
  reactions: { emoji: string; count: number; mine: boolean }[]
}

type MessageRow = {
  id: string
  sender_id: string
  body: string
  lang: string | null
  media_file: string | null
  post_id: string | null
  created_at: number
  deleted_at: number | null
  call_status: CallOutcome | null
  call_seconds: number
  call_kind: "dm" | "group"
  call_people: number
  sender_name: string
  sender_handle: string
  reply_to_id: string | null
  reply_id: string | null
  reply_body: string | null
  reply_media: string | null
  reply_post: string | null
  reply_deleted: number | null
  reply_sender_name: string | null
}

// The original message is joined in the same chat only, so a reply can never quote something from another conversation.
const MESSAGE_SELECT = `SELECT m.id, m.sender_id, m.body, m.lang, m.media_file, m.post_id, m.created_at, m.deleted_at, m.call_status, m.call_seconds, m.call_kind, m.call_people,
       u.name AS sender_name, u.handle AS sender_handle,
       m.reply_to_id, rm.id AS reply_id, rm.body AS reply_body, rm.media_file AS reply_media, rm.post_id AS reply_post,
       rm.deleted_at AS reply_deleted, ru.name AS reply_sender_name
     FROM chat_messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN chat_messages rm ON rm.id = m.reply_to_id AND rm.conversation_id = m.conversation_id
     LEFT JOIN users ru ON ru.id = rm.sender_id
     WHERE m.conversation_id = ?`

// A short line for a quoted message: its text, or what it was instead.
function replySnippet(body: string, media: string | null, post: string | null): string {
  const text = body.replace(/\s+/g, " ").trim()
  if (text) return [...text].length > 140 ? `${[...text].slice(0, 139).join("")}…` : text
  if (media) return isVoiceFile(media) ? "Voice message" : "Photo"
  if (post) return "Shared a post"
  return "Message"
}

// The latest messages in a conversation, oldest first. Empty for anyone who may not read it.
export function conversationMessages(conversationId: string, viewerId: string, limit = 200): MessageView[] {
  if (!canReadConversation(conversationId, viewerId)) return []
  const { rows } = pageBefore<MessageRow>(MESSAGE_SELECT, [conversationId], "m.created_at", "m.id", (r) => r.created_at, null, limit)
  return toMessageViews(rows.reverse(), conversationId, viewerId)
}

// Messages sent before `beforeCreatedAt` (the createdAt of the oldest message on screen), oldest first, for "Load
// earlier". A page holds `limit` messages, plus any that share the oldest one's timestamp, so passing the oldest
// createdAt back never skips a message. Fewer than `limit` means the start of the conversation was reached. Empty for
// anyone who may not read the conversation.
export function messagesBefore(conversationId: string, viewerId: string, beforeCreatedAt: number, limit = MESSAGE_PAGE_SIZE): MessageView[] {
  if (!Number.isFinite(beforeCreatedAt)) return []
  if (!canReadConversation(conversationId, viewerId)) return []
  const size = Math.min(Math.max(Math.floor(limit), 1), 200)
  const { rows } = pageBefore<MessageRow>(MESSAGE_SELECT, [conversationId], "m.created_at", "m.id", (r) => r.created_at, beforeCreatedAt, size)
  return toMessageViews(rows.reverse(), conversationId, viewerId)
}

function toMessageViews(rows: MessageRow[], conversationId: string, viewerId: string): MessageView[] {
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
  // A shared post shows only while the viewer may see it, the same rule as opening its link.
  const shared = visiblePostIds(
    rows.flatMap((r) => (r.post_id && !r.deleted_at ? [r.post_id] : [])),
    viewerId,
    true
  )
  const posts = new Map(loadPosts([...shared], viewerId).map((p) => [p.id, p]))
  return rows.map((r) => {
    const others = readers.filter((m) => m.user_id !== r.sender_id)
    const seen = r.sender_id === viewerId && others.length > 0 && others.every((m) => m.last_read_at >= r.created_at)
    const post = r.post_id && !r.deleted_at ? posts.get(r.post_id) ?? null : null
    const replyTo =
      r.reply_to_id && r.reply_id
        ? {
            id: r.reply_id,
            senderName: r.reply_sender_name ?? "Someone",
            snippet: r.reply_deleted ? "" : replySnippet(r.reply_body ?? "", r.reply_media, r.reply_post),
            deleted: r.reply_deleted !== null,
          }
        : null
    return {
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderHandle: r.sender_handle,
      mine: r.sender_id === viewerId,
      body: r.deleted_at ? "" : r.body,
      lang: r.deleted_at ? "" : (r.lang ?? ""),
      deleted: r.deleted_at !== null,
      mediaFile: r.deleted_at ? null : r.media_file,
      post,
      postUnavailable: r.post_id !== null && !r.deleted_at && post === null,
      call: r.call_status
        ? { outcome: r.call_status, seconds: r.call_seconds, kind: r.call_kind, people: r.call_people }
        : null,
      replyTo: r.deleted_at ? null : replyTo,
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

// How active a topic is: posts that used it in the last week (the same posts trending counts), and how many people follow
// it. Counted on request for one tag, so it is always exact rather than a sample.
export function topicSummary(tag: string): { postsThisWeek: number; followers: number } {
  const clean = normalizeTag(tag)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const rows = all<{ body: string }>(
    `SELECT p.body FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.created_at > ? AND ${LIVE} AND u.deactivated_at IS NULL AND instr(lower(p.body), ?) > 0
       AND NOT EXISTS (SELECT 1 FROM communities c WHERE c.id = p.community_id AND c.access = 'closed')
     ORDER BY p.created_at DESC LIMIT 2000`,
    weekAgo,
    `#${clean}`
  )
  const postsThisWeek = rows.filter((row) => extractHashtags(row.body).includes(clean)).length
  const followers = get<{ n: number }>("SELECT COUNT(*) AS n FROM topic_follows WHERE tag = ?", clean)?.n ?? 0
  return { postsThisWeek, followers }
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

// Accounts to offer while someone types an @mention. Deactivated accounts and accounts blocked either way are left out.
export function suggestHandles(prefix: string, viewerId: string, limit = 6): MiniUser[] {
  return all<{ id: string; handle: string; name: string; avatar_file: string | null; verified: number }>(
    `SELECT u.id, u.handle, u.name, u.avatar_file, u.verified FROM users u
     WHERE u.handle LIKE ? ESCAPE '\\' AND ${NOT_HIDDEN}
     ORDER BY u.followers_count DESC, u.handle COLLATE NOCASE LIMIT ?`,
    `${prefix.replace(/[\\%_]/g, (m) => `\\${m}`)}%`,
    viewerId,
    viewerId,
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

// Empty when the viewer may not see the post, so a draft's or scheduled post's history stays with its author.
export function editHistoryFor(postId: string, viewerId: string): EditVersion[] {
  if (!canSeePost(postId, viewerId)) return []
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

// Searches the account chose to keep, newest first.
export function savedSearches(viewerId: string): string[] {
  return all<{ query: string }>("SELECT query FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", viewerId, SAVED_SEARCH_LIMIT).map(
    (row) => row.query
  )
}

// Lists whose name matches the words. A private list shows only to its owner, as it does everywhere else.
export function searchLists(query: string, viewerId: string, limit = 30): ListSummary[] {
  const pattern = `%${query.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  return listRowsWhere("(l.private = 0 OR l.owner_id = ?) AND l.name LIKE ? ESCAPE '\\'", [viewerId, pattern], viewerId).slice(0, limit)
}

// Analytics for an account's own posts and profile. Visits and views are counted per day in UTC.
// One UTC day: the views of the account's posts, the profile visits, and the new followers that day.
export type AnalyticsDay = { label: string; visits: number; views: number; follows: number }

export type AnalyticsView = {
  followers: number
  // The last 56 days, oldest first. The two most recent 28-day spans are the ones compared on the page.
  days: AnalyticsDay[]
  // The posts seen most in the last 28 days. `views` is each post's view count over those 28 days.
  topPosts: { id: string; handle: string; body: string; views: number; likes: number }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function analyticsFor(userId: string, handle: string, now = Date.now()): AnalyticsView {
  const today = Math.floor(now / DAY_MS)
  const windowStart = (today - 55) * DAY_MS
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
  const followDays = all<{ day: number; c: number }>(
    `SELECT CAST(created_at / ? AS INTEGER) AS day, COUNT(*) AS c FROM follows
     WHERE followee_id = ? AND created_at >= ? GROUP BY day`,
    DAY_MS,
    userId,
    windowStart
  )
  const days: AnalyticsDay[] = []
  for (let offset = 55; offset >= 0; offset--) {
    const day = today - offset
    days.push({
      label: new Date(day * DAY_MS).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      visits: visitDays.find((row) => row.day === day)?.c ?? 0,
      views: viewDays.find((row) => row.day === day)?.c ?? 0,
      follows: followDays.find((row) => row.day === day)?.c ?? 0,
    })
  }

  // Ranked by views in the last 28 days. The author's own views never count, here or on the post cards.
  const topPosts = all<{ id: string; body: string; views: number; likes: number }>(
    `SELECT id, body, views, likes FROM (
       SELECT p.id, p.body, p.created_at,
         (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id AND v.viewer_id <> p.author_id AND v.created_at >= ?) AS views,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes
       FROM posts p
       WHERE p.author_id = ? AND p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL
     ) WHERE views > 0
     ORDER BY views DESC, created_at DESC
     LIMIT 5`,
    now - 28 * DAY_MS,
    userId
  ).map((row) => ({ ...row, handle }))

  return {
    followers: count("SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?", userId),
    days,
    topPosts,
  }
}

export function mentionsVerifiedOnly(userId: string): boolean {
  return get<{ mentions_verified_only: number }>("SELECT mentions_verified_only FROM users WHERE id = ?", userId)?.mentions_verified_only === 1
}

export type OwnPostRow = {
  id: string
  body: string
  createdAt: number
  views: number
  likes: number
  reposts: number
  quotes: number
  replies: number
  bookmarks: number
  // Same rule as the post page: actions per view, as a percentage. Null when nobody has viewed the post.
  engagementRate: number | null
  // Clicks by kind, all time, like the other counts.
  clicks: ClickCounts
}

// Every live post the account has written, newest first, with the counts the post page shows. Views and actions are
// all time, as they are on the post page, so a row and its post page always agree.
export function ownPostRows(authorId: string): OwnPostRow[] {
  const rows = all<{
    id: string
    body: string
    created_at: number
    views: number
    likes: number
    reposts: number
    quotes: number
    replies: number
    bookmarks: number
  }>(
    `SELECT p.id, p.body, p.created_at,
       (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id AND v.viewer_id <> p.author_id) AS views,
       (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
       (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id) AS reposts,
       (SELECT COUNT(*) FROM posts q WHERE q.quote_of_id = p.id AND q.is_draft = 0 AND q.publish_at IS NULL) AS quotes,
       (SELECT COUNT(*) FROM posts c WHERE c.reply_to_id = p.id AND c.is_draft = 0 AND c.publish_at IS NULL) AS replies,
       (SELECT COUNT(*) FROM bookmarks b WHERE b.post_id = p.id) AS bookmarks
     FROM posts p
     WHERE p.author_id = ? AND p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL
     ORDER BY p.created_at DESC, p.id DESC`,
    authorId
  )

  const clicks = clickCountsByPost(authorId)
  return rows.map((row) => {
    const actions = row.likes + row.reposts + row.quotes + row.replies + row.bookmarks
    return {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      views: row.views,
      likes: row.likes,
      reposts: row.reposts,
      quotes: row.quotes,
      replies: row.replies,
      bookmarks: row.bookmarks,
      engagementRate: row.views > 0 ? Math.round((actions / row.views) * 1000) / 10 : null,
      clicks: clicks.get(row.id) ?? emptyClickCounts(),
    }
  })
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
  // Clicks by kind, all time.
  clicks: ClickCounts
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
    clicks: clickCountsFor(postId),
    days,
  }
}

// Who may load an uploaded file. Avatars and banners are public. A post's photo or video goes to anyone who may see a
// post that uses it, and a photo sent in a chat goes to the members who may read that conversation. "none" covers
// everything else, including files nothing uses any more.
export function mediaAccess(file: string, viewerId: string | null): "public" | "private" | "none" {
  if (get("SELECT 1 AS found FROM users WHERE avatar_file = ? OR banner_file = ? LIMIT 1", file, file)) return "public"
  // A link preview's picture is shown to anyone who can see the post, and holds nothing about a viewer.
  if (get("SELECT 1 AS found FROM link_previews WHERE image_file = ? LIMIT 1", file)) return "public"
  if (!viewerId) return "none"
  const posts = all<{ post_id: string }>(
    "SELECT post_id FROM post_media WHERE file = ? UNION SELECT id AS post_id FROM posts WHERE media_file = ?",
    file,
    file
  )
  if (visiblePostIds(posts.map((row) => row.post_id), viewerId).size > 0) return "private"
  const chats = all<{ conversation_id: string }>(
    "SELECT DISTINCT conversation_id FROM chat_messages WHERE media_file = ? AND deleted_at IS NULL",
    file
  )
  if (chats.some((row) => canReadConversation(row.conversation_id, viewerId))) return "private"
  return "none"
}
