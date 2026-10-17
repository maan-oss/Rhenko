import { getViewer } from "@/lib/auth"
import { settingsFor } from "@/lib/connections"
import { all, get } from "@/lib/db"
import { languageName } from "@/lib/languages"
import { consume, waitLabel } from "@/lib/rate-limit"
import { notificationPrefsFor } from "@/lib/settings-data"
import { readUpload, uploadSize } from "@/lib/uploads"
import { ZIP_MAX_BYTES, ZIP_MAX_ENTRIES, ZipWriter, zipSize } from "@/lib/zip"

// A copy of the signed-in person's account as a ZIP file: data.json, and a media folder with the files data.json
// points to. The "Your data" section in Settings, Account lists exactly what is included; keep the two in step.

const EXPORTS_PER_HOUR = 5

type Media = { name: string; size: number }

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString()
}

// Every stored file the export can include, found in storage now. Files that are gone are left out, and data.json
// shows null where they were.
async function findMedia(userId: string): Promise<Map<string, Media>> {
  const profile = await get<{ avatar_file: string | null; banner_file: string | null }>(
    "SELECT avatar_file, banner_file FROM users WHERE id = ?",
    userId
  )
  const postFiles = (await all<{ file: string }>(
    "SELECT pm.file FROM post_media pm JOIN posts p ON p.id = pm.post_id WHERE p.author_id = ?",
    userId
  )).map((row) => row.file)
  const messageFiles = (await all<{ media_file: string }>(
    `SELECT m.media_file FROM chat_messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE m.media_file IS NOT NULL AND m.deleted_at IS NULL`,
    userId
  )).map((row) => row.media_file)
  const found = new Map<string, Media>()
  for (const name of [profile?.avatar_file ?? null, profile?.banner_file ?? null, ...postFiles, ...messageFiles]) {
    if (!name || found.has(name)) continue
    const size = await uploadSize(name)
    if (size !== null) found.set(name, { name, size })
  }
  return found
}

async function collect(userId: string, media: Map<string, Media>) {
  const file = (name: string | null): string | null => (name && media.has(name) ? `media/${name}` : null)

  const user = await get<{
    handle: string
    name: string
    bio: string
    location: string
    website: string
    birthday: string | null
    status: string
    email: string | null
    email_verified_at: number | null
    protected: number
    verified: number
    created_at: number
    avatar_file: string | null
    banner_file: string | null
    mentions_verified_only: number
  }>(
    `SELECT handle, name, bio, location, website, birthday, status, email, email_verified_at, protected, verified,
       created_at, avatar_file, banner_file, mentions_verified_only
     FROM users WHERE id = ?`,
    userId
  )
  if (!user) return null

  // Posts and replies, each with its state, media and poll.
  const postRows = await all<{
    id: string
    body: string
    reply_to_id: string | null
    reply_to_author: string | null
    quote_of_id: string | null
    created_at: number
    edited_at: number | null
    publish_at: number | null
    is_draft: number
    sensitive: number
    reply_setting: string
    lang: string | null
  }>(
    `SELECT p.id, p.body, p.reply_to_id, pu.handle AS reply_to_author, p.quote_of_id, p.created_at, p.edited_at,
       p.publish_at, p.is_draft, p.sensitive, p.reply_setting, p.lang
     FROM posts p
     LEFT JOIN posts parent ON parent.id = p.reply_to_id
     LEFT JOIN users pu ON pu.id = parent.author_id
     WHERE p.author_id = ? ORDER BY p.created_at DESC`,
    userId
  )
  const mediaRows = await all<{ post_id: string; file: string; kind: string; alt: string }>(
    `SELECT pm.post_id, pm.file, pm.kind, pm.alt FROM post_media pm JOIN posts p ON p.id = pm.post_id
     WHERE p.author_id = ? ORDER BY pm.post_id, pm.position`,
    userId
  )
  const pollRows = await all<{ post_id: string; ends_at: number }>(
    "SELECT pl.post_id, pl.ends_at FROM polls pl JOIN posts p ON p.id = pl.post_id WHERE p.author_id = ?",
    userId
  )
  const optionRows = await all<{ post_id: string; label: string; votes: number }>(
    `SELECT o.post_id, o.label, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes
     FROM poll_options o JOIN posts p ON p.id = o.post_id
     WHERE p.author_id = ? ORDER BY o.post_id, o.position`,
    userId
  )
  const mediaByPost = new Map<string, { file: string | null; kind: string; alt: string }[]>()
  for (const row of mediaRows) {
    const list = mediaByPost.get(row.post_id) ?? []
    list.push({ file: file(row.file), kind: row.kind, alt: row.alt })
    mediaByPost.set(row.post_id, list)
  }
  const optionsByPost = new Map<string, { choice: string; votes: number }[]>()
  for (const row of optionRows) {
    const list = optionsByPost.get(row.post_id) ?? []
    list.push({ choice: row.label, votes: row.votes })
    optionsByPost.set(row.post_id, list)
  }
  const pollByPost = new Map(pollRows.map((row) => [row.post_id, row.ends_at]))
  const shapePost = (row: (typeof postRows)[number]) => {
    const state = row.is_draft === 1 ? "draft" : row.publish_at !== null ? "scheduled" : "published"
    const endsAt = pollByPost.get(row.id)
    return {
      id: row.id,
      state,
      text: row.body,
      createdAt: iso(row.created_at),
      scheduledFor: state === "scheduled" ? iso(row.publish_at) : null,
      editedAt: iso(row.edited_at),
      ...(row.reply_to_id ? { replyTo: { postId: row.reply_to_id, author: row.reply_to_author } } : {}),
      quoteOf: row.quote_of_id,
      sensitive: row.sensitive === 1,
      whoCanReply: row.reply_setting,
      language: row.lang || null,
      media: mediaByPost.get(row.id) ?? [],
      poll: endsAt === undefined ? null : { endsAt: iso(endsAt), choices: optionsByPost.get(row.id) ?? [] },
    }
  }

  const handleRows = async (sql: string) =>
    (await all<{ handle: string; created_at: number }>(sql, userId)).map((row) => ({ handle: row.handle, since: iso(row.created_at) }))

  const ownedLists = await all<{ id: string; name: string; description: string; private: number; created_at: number }>(
    "SELECT id, name, description, private, created_at FROM lists WHERE owner_id = ? ORDER BY created_at DESC",
    userId
  )
  const listMembers = await all<{ list_id: string; handle: string }>(
    `SELECT m.list_id, u.handle FROM list_members m JOIN lists l ON l.id = m.list_id JOIN users u ON u.id = m.user_id
     WHERE l.owner_id = ? ORDER BY m.created_at`,
    userId
  )

  // Every conversation the account is in, with all of its messages that weren't deleted.
  const conversations = await all<{ id: string; kind: string; title: string; status: string; joined_at: number }>(
    `SELECT c.id, c.kind, c.title, cm.status, cm.joined_at FROM conversation_members cm
     JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.user_id = ? ORDER BY c.updated_at DESC`,
    userId
  )
  const memberRows = await all<{ conversation_id: string; handle: string }>(
    `SELECT cm.conversation_id, u.handle FROM conversation_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?)
     ORDER BY cm.joined_at`,
    userId
  )
  const messageRows = await all<{
    conversation_id: string
    sender: string
    body: string
    media_file: string | null
    post_id: string | null
    call_status: string | null
    call_seconds: number
    created_at: number
    lang: string | null
  }>(
    `SELECT m.conversation_id, u.handle AS sender, m.body, m.media_file, m.post_id, m.call_status, m.call_seconds, m.created_at, m.lang
     FROM chat_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?) AND m.deleted_at IS NULL
     ORDER BY m.conversation_id, m.created_at, m.id`,
    userId
  )
  const membersByConversation = new Map<string, string[]>()
  for (const row of memberRows) {
    const list = membersByConversation.get(row.conversation_id) ?? []
    list.push(row.handle)
    membersByConversation.set(row.conversation_id, list)
  }
  const messagesByConversation = new Map<string, object[]>()
  for (const row of messageRows) {
    const list = messagesByConversation.get(row.conversation_id) ?? []
    list.push({
      from: row.sender,
      sentAt: iso(row.created_at),
      text: row.body,
      photo: file(row.media_file),
      sharedPostId: row.post_id,
      call: row.call_status ? { outcome: row.call_status, seconds: row.call_seconds } : null,
      language: row.lang || null,
    })
    messagesByConversation.set(row.conversation_id, list)
  }

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      handle: user.handle,
      name: user.name,
      bio: user.bio,
      location: user.location,
      website: user.website,
      birthday: user.birthday,
      status: user.status,
      email: user.email,
      emailVerified: user.email_verified_at !== null,
      protected: user.protected === 1,
      verified: user.verified === 1,
      joinedAt: iso(user.created_at),
      profilePhoto: file(user.avatar_file),
      banner: file(user.banner_file),
    },
    // Where the person is and the languages they use, for suggestions only. Nobody else sees the city or town.
    connections: await (async () => {
      const settings = await settingsFor(userId)
      return {
        where: {
          country: settings.country || null,
          countryName: settings.countryName,
          cityOrTown: settings.area || null,
          region: settings.region || null,
        },
        suggestNearby: settings.suggestNearby,
        suggestLanguagePartners: settings.suggestLanguage,
        setup: settings.onboarding,
        languages: {
          speak: settings.speak.map((item) => ({ code: item.code, name: languageName(item.code), level: item.level })),
          learn: settings.learn.map((code) => ({ code, name: languageName(code) })),
        },
        notNow: await handleRows(
          "SELECT u.handle, d.created_at FROM connection_dismissals d JOIN users u ON u.id = d.user_id WHERE d.viewer_id = ? ORDER BY d.created_at DESC"
        ),
      }
    })(),
    posts: postRows.filter((row) => row.reply_to_id === null).map(shapePost),
    replies: postRows.filter((row) => row.reply_to_id !== null).map(shapePost),
    likes: (await all<{ post_id: string; author: string; created_at: number }>(
      `SELECT l.post_id, u.handle AS author, l.created_at FROM likes l
       JOIN posts p ON p.id = l.post_id JOIN users u ON u.id = p.author_id
       WHERE l.user_id = ? ORDER BY l.created_at DESC`,
      userId
    )).map((row) => ({ postId: row.post_id, author: row.author, likedAt: iso(row.created_at) })),
    reposts: (await all<{ post_id: string; author: string; created_at: number }>(
      `SELECT r.post_id, u.handle AS author, r.created_at FROM reposts r
       JOIN posts p ON p.id = r.post_id JOIN users u ON u.id = p.author_id
       WHERE r.user_id = ? ORDER BY r.created_at DESC`,
      userId
    )).map((row) => ({ postId: row.post_id, author: row.author, repostedAt: iso(row.created_at) })),
    bookmarkFolders: (await all<{ name: string; created_at: number }>(
      "SELECT name, created_at FROM bookmark_folders WHERE user_id = ? ORDER BY created_at",
      userId
    )).map((row) => ({ name: row.name, createdAt: iso(row.created_at) })),
    bookmarks: (await all<{ post_id: string; author: string; folder: string | null; created_at: number }>(
      `SELECT b.post_id, u.handle AS author, f.name AS folder, b.created_at FROM bookmarks b
       JOIN posts p ON p.id = b.post_id JOIN users u ON u.id = p.author_id
       LEFT JOIN bookmark_folders f ON f.id = b.folder_id
       WHERE b.user_id = ? ORDER BY b.created_at DESC`,
      userId
    )).map((row) => ({ postId: row.post_id, author: row.author, folder: row.folder, savedAt: iso(row.created_at) })),
    highlights: (await all<{ post_id: string; created_at: number }>(
      "SELECT post_id, created_at FROM highlights WHERE user_id = ? ORDER BY created_at DESC",
      userId
    )).map((row) => ({ postId: row.post_id, addedAt: iso(row.created_at) })),
    following: await handleRows(
      "SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY f.created_at DESC"
    ),
    followers: await handleRows(
      "SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? ORDER BY f.created_at DESC"
    ),
    followRequests: {
      sent: await handleRows(
        "SELECT u.handle, r.created_at FROM follow_requests r JOIN users u ON u.id = r.target_id WHERE r.requester_id = ? ORDER BY r.created_at DESC"
      ),
      received: await handleRows(
        "SELECT u.handle, r.created_at FROM follow_requests r JOIN users u ON u.id = r.requester_id WHERE r.target_id = ? ORDER BY r.created_at DESC"
      ),
    },
    blocked: await handleRows(
      "SELECT u.handle, b.created_at FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC"
    ),
    muted: await handleRows(
      "SELECT u.handle, m.created_at FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.muter_id = ? ORDER BY m.created_at DESC"
    ),
    mutedWords: (await all<{ word: string; created_at: number }>(
      "SELECT word, created_at FROM muted_words WHERE user_id = ? ORDER BY created_at DESC",
      userId
    )).map((row) => ({ word: row.word, since: iso(row.created_at) })),
    lists: {
      made: ownedLists.map((list) => ({
        name: list.name,
        description: list.description,
        private: list.private === 1,
        createdAt: iso(list.created_at),
        members: listMembers.filter((member) => member.list_id === list.id).map((member) => member.handle),
      })),
      followed: (await all<{ name: string; owner: string; created_at: number }>(
        `SELECT l.name, u.handle AS owner, lf.created_at FROM list_follows lf
         JOIN lists l ON l.id = lf.list_id JOIN users u ON u.id = l.owner_id
         WHERE lf.user_id = ? ORDER BY lf.created_at DESC`,
        userId
      )).map((row) => ({ name: row.name, owner: row.owner, followedAt: iso(row.created_at) })),
    },
    topics: (await all<{ tag: string; created_at: number }>(
      "SELECT tag, created_at FROM topic_follows WHERE user_id = ? ORDER BY created_at DESC",
      userId
    )).map((row) => ({ tag: row.tag, since: iso(row.created_at) })),
    pollVotes: (await all<{ post_id: string; label: string; created_at: number }>(
      `SELECT v.post_id, o.label, v.created_at FROM poll_votes v JOIN poll_options o ON o.id = v.option_id
       WHERE v.user_id = ? ORDER BY v.created_at DESC`,
      userId
    )).map((row) => ({ postId: row.post_id, choice: row.label, votedAt: iso(row.created_at) })),
    communityNotes: (await all<{ post_id: string; body: string; created_at: number }>(
      "SELECT post_id, body, created_at FROM community_notes WHERE author_id = ? ORDER BY created_at DESC",
      userId
    )).map((row) => ({ postId: row.post_id, text: row.body, writtenAt: iso(row.created_at) })),
    notificationSettings: {
      ...await notificationPrefsFor(userId),
      mentionsFromVerifiedAccountsOnly: user.mentions_verified_only === 1,
    },
    recentSearches: (await all<{ query: string; created_at: number }>(
      "SELECT query, created_at FROM recent_searches WHERE user_id = ? ORDER BY created_at DESC",
      userId
    )).map((row) => ({ query: row.query, searchedAt: iso(row.created_at) })),
    conversations: conversations.map((conversation) => ({
      kind: conversation.kind === "group" ? "group" : "direct",
      title: conversation.title,
      request: conversation.status === "requested",
      joinedAt: iso(conversation.joined_at),
      members: membersByConversation.get(conversation.id) ?? [],
      messages: messagesByConversation.get(conversation.id) ?? [],
    })),
  }
}

// Streams the archive one file at a time, so a large media folder is never held in memory at once.
function archive(json: Uint8Array, media: Media[]): ReadableStream<Uint8Array> {
  const zip = new ZipWriter()
  let next = -1
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (next === -1) {
          for (const chunk of [...zip.file("data.json", json), ...zip.folder("media/")]) controller.enqueue(chunk)
          next = 0
          return
        }
        while (next < media.length) {
          const item = media[next++]
          const bytes = await readUpload(item.name)
          // Removed after the list was made, so it is left out.
          if (!bytes) continue
          for (const chunk of zip.file(`media/${item.name}`, bytes)) controller.enqueue(chunk)
          return
        }
        controller.enqueue(zip.finish())
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

export async function GET() {
  const viewer = await getViewer()
  if (!viewer) return Response.json({ error: "Sign in to download your data." }, { status: 401 })

  const limit = await consume(`export:${viewer.id}`, EXPORTS_PER_HOUR, 60 * 60 * 1000)
  if (!limit.ok) {
    return Response.json(
      { error: `You've downloaded your data ${EXPORTS_PER_HOUR} times this hour. Try again in ${waitLabel(limit.retryAfterSeconds)}.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    )
  }

  const found = await findMedia(viewer.id)
  const data = await collect(viewer.id, found)
  if (!data) return Response.json({ error: "Sign in to download your data." }, { status: 401 })
  const json = Buffer.from(JSON.stringify(data, null, 2), "utf8")
  const media = [...found.values()]

  const entries = [{ name: "data.json", size: json.length }, { name: "media/", size: 0 }, ...media.map((item) => ({ name: `media/${item.name}`, size: item.size }))]
  if (entries.length > ZIP_MAX_ENTRIES || zipSize(entries) > ZIP_MAX_BYTES) {
    return Response.json(
      { error: "Your data is larger than one ZIP file can hold (4 GB). Ask the person who runs this server for a copy." },
      { status: 413 }
    )
  }

  return new Response(archive(json, media), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="rhenko-${viewer.handle}-data.zip"`,
      "Cache-Control": "no-store",
    },
  })
}
