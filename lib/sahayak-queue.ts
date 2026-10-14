// The queue of questions for Sahayak, the account that answers mentions of @sahayak. Server only.
//
// A mention is written down as a job when its post goes live, and the answer is made in the background, so the post is
// never held up by the model. One job per asking post: a post's mention is answered once, even if announcing it runs
// twice. Nothing is queued unless Sarvam is set up, so a server without it keeps no questions it cannot answer.
import { run } from "@/lib/db"
import { sahayakOn } from "@/lib/sarvam"

export const SAHAYAK_ID = "sahayak-bot"

export function queueQuestion(postId: string, askerId: string, now = Date.now()): void {
  if (!sahayakOn()) return
  run(
    "INSERT OR IGNORE INTO sahayak_jobs (post_id, asker_id, status, attempts, run_after, created_at) VALUES (?, ?, 'queued', 0, ?, ?)",
    postId,
    askerId,
    now,
    now
  )
  // Answering starts now rather than at the next maintenance tick. The import is dynamic so this module stays free of the
  // answering code, which depends on the post writes that call this.
  void import("@/lib/sahayak")
    .then((worker) => worker.answerQuestions())
    .catch((error) => console.error("[sahayak] answering failed", error))
}
