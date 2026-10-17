// Answers the questions queued by mentions of @sahayak. Server only. It runs from the maintenance tick, and at once when a
// question is queued (lib/sahayak-queue.ts). Each attempt is leased before the model is called, so a crash between the
// call and the reply never answers the same question twice. A failed answer is tried again a few times before Sahayak
// says it could not answer. A reader can ask a set number of questions an hour, and the rest get a notice.
//
// A question is answered from the post that asks it and the posts it replies to or quotes, but only the ones the asker
// can see. The reply is a post by Sahayak, written in the same circle as the post it answers, and it goes through the same
// checks and notices as any other post.
import { randomUUID } from "node:crypto"
import { all, get, run } from "@/lib/db"
import { canSeeLivePost } from "@/lib/data"
import { goLive } from "@/lib/screening"
import { languageOf } from "@/lib/languages"
import { consume, waitLabel } from "@/lib/rate-limit"
import { askSarvam, sahayakOn } from "@/lib/sarvam"
import { SAHAYAK_ID } from "@/lib/sahayak-queue"
import { buildMessages, cleanAnswer, FAILED_TEXT, limitNotice, questionOf, type Context } from "@/lib/sahayak-prompt"

const BATCH = 3
const LEASE_MS = 90_000
const BACKOFF_MS = 30_000
const MAX_ATTEMPTS = 3
const HOUR = 60 * 60_000
const QUESTIONS_PER_HOUR = 20
const CONTEXT_POSTS = 4
// A pass takes a few questions at a time, and a pass ends when nothing is due. The passes are capped, so a question that keeps
// failing cannot hold the tick.
const MAX_PASSES = 20

type Post = {
  id: string
  author_id: string
  body: string
  community_id: string | null
  reply_to_id: string | null
  quote_of_id: string | null
  removed_at: number | null
}
type Job = { post_id: string; asker_id: string }

// One batch at a time in this process. Across processes, each question is claimed in the database before it is answered.
let busy = false

export async function answerQuestions(): Promise<void> {
  if (busy || !sahayakOn()) return
  busy = true
  try {
    // Loops until nothing is due, so a question queued during a pass is picked up in the same pass.
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const due = await all<Job>(
        "SELECT post_id, asker_id FROM sahayak_jobs WHERE status = 'queued' AND run_after <= ? ORDER BY run_after LIMIT ?",
        Date.now(),
        BATCH
      )
      if (due.length === 0) break
      for (const job of due) {
        const attempts = await claim(job.post_id, Date.now())
        if (attempts === null) continue
        try {
          await answerOne(job, attempts)
        } catch (error) {
          console.error("[sahayak] an answer failed", error)
        }
      }
    }
  } finally {
    busy = false
  }
}

// Takes a due question for this attempt. One conditional update does it, so when several processes look at the same question
// only one gets it. The question is held for a while, so if this process stops now the question waits out the lease instead of
// being tried again straight away. Returns the attempts used so far, this one included, or null when someone else has it.
async function claim(postId: string, now: number): Promise<number | null> {
  const row = await get<{ attempts: number }>(
    "UPDATE sahayak_jobs SET attempts = attempts + 1, run_after = ? WHERE post_id = ? AND status = 'queued' AND run_after <= ? RETURNING attempts",
    now + LEASE_MS,
    postId,
    now
  )
  return row ? row.attempts : null
}

async function answerOne(job: Job, attempts: number): Promise<void> {
  const post = await get<Post>(
    "SELECT id, author_id, body, community_id, reply_to_id, quote_of_id, removed_at FROM posts WHERE id = ?",
    job.post_id
  )
  if (!post || post.removed_at !== null) {
    await finish(job.post_id, "skipped")
    return
  }

  const limit = await consume(`sahayak-ask:${job.asker_id}`, QUESTIONS_PER_HOUR, HOUR)
  if (!limit.ok) {
    await reply(post, limitNotice(waitLabel(limit.retryAfterSeconds)))
    await finish(job.post_id, "limited")
    return
  }

  const answer = await askSarvam(buildMessages(questionOf(post.body), await contextFor(post, job.asker_id)))
  if (answer.ok) {
    await reply(post, cleanAnswer(answer.text))
    await finish(job.post_id, "done")
    return
  }
  if (attempts >= MAX_ATTEMPTS) {
    await reply(post, FAILED_TEXT)
    await finish(job.post_id, "failed")
    return
  }
  await run("UPDATE sahayak_jobs SET run_after = ? WHERE post_id = ?", Date.now() + BACKOFF_MS * attempts, job.post_id)
}

// The quoted post, then the chain of replies above the question, nearest first. The walk stops at the first post the asker
// can't see, because posts above it are not something the asker has been shown.
async function contextFor(post: Post, askerId: string): Promise<Context[]> {
  const ids: string[] = []
  if (post.quote_of_id) ids.push(post.quote_of_id)
  const seen = new Set<string>([post.id])
  let cursor = post.reply_to_id
  while (cursor && ids.length < CONTEXT_POSTS && !seen.has(cursor)) {
    seen.add(cursor)
    ids.push(cursor)
    cursor = (await get<{ reply_to_id: string | null }>("SELECT reply_to_id FROM posts WHERE id = ?", cursor))?.reply_to_id ?? null
  }
  const visible: Context[] = []
  for (const id of ids) {
    if (!await canSeeLivePost(id, askerId)) break
    const row = await get<{ body: string; handle: string }>(
      "SELECT p.body, u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
      id
    )
    if (row) visible.push({ handle: row.handle, body: row.body })
  }
  return visible.reverse()
}

// Writes Sahayak's post as a reply, the way a reader's reply is written, and then runs the same checks and notices.
async function reply(parent: Post, text: string): Promise<void> {
  const now = Date.now()
  const id = randomUUID()
  await run(
    `INSERT INTO posts (id, author_id, body, reply_to_id, quote_of_id, media_file, created_at, reply_setting, sensitive, publish_at, is_draft, thread_id, lang, community_id, title)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 'everyone', 0, NULL, 0, NULL, ?, ?, '')`,
    id,
    SAHAYAK_ID,
    text,
    parent.id,
    now,
    languageOf(text),
    parent.community_id
  )
  await goLive(id, now)
}

async function finish(postId: string, status: "done" | "limited" | "failed" | "skipped"): Promise<void> {
  await run("UPDATE sahayak_jobs SET status = ?, finished_at = ? WHERE post_id = ?", status, Date.now(), postId)
}
