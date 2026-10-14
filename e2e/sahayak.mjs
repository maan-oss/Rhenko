// Sahayak, the AI account that answers a mention of @sahayak under a post. Two modes, chosen by the server it runs against:
//   E2E_SAHAYAK=1   the server runs with RHENKO_SARVAM_KEY and RHENKO_SARVAM_URL pointed at e2e/lib/sarvam-stub.mjs. The
//                   answer is checked, the failure is retried, and the account is checked.
//   (unset)         the server has no Sarvam key. A mention gets no answer and leaves no question behind.
// Either way, the account can't be signed into, and it is labelled as an AI.
import { area, assert, check, guard } from "./lib/harness.mjs"
import { RUN_ID, TIMEOUT, PASSWORD, randomWord, sleep } from "./lib/env.mjs"
import { createUser, signOut, trySignIn } from "./lib/accounts.mjs"
import { postIdByBody, query } from "./lib/db.mjs"
import { card, homeComposer, openHome, replyButton, typeIn, waitForPost } from "./lib/posts.mjs"
import { acted, go, toastText } from "./lib/ui.mjs"

const SAHAYAK_ON = process.env.E2E_SAHAYAK === "1"
const BOT_ID = "sahayak-bot"

export async function run() {
  area("sahayak")
  await guard("the Sahayak account is an AI, and no password signs into it", accountChecks)
  if (SAHAYAK_ON) {
    await guard("a mention of @sahayak gets an answer, posted by Sahayak under the question", answersMention)
    await guard("a mention in a reply is answered from the post it replies to, as a reply to the reply", answersInReply)
    await guard("a failed answer is retried, and no answer is posted until it succeeds", retriesFailure)
  } else {
    await guard("with Sahayak not set up, a mention gets no answer and leaves no question behind", noAnswerWhenOff)
  }
}

async function accountChecks() {
  const reader = await createUser({ tag: "sbt" })

  await check("the Sahayak account shows the AI label and its bio on its profile", async () => {
    await go(
      reader.page,
      "/sahayak",
      reader.page.getByText("An AI assistant. Mention @sahayak under a post to ask it a question.")
    )
    await reader.page.getByText("AI", { exact: true }).first().waitFor()
  })

  await check("no password signs into the Sahayak account", async () => {
    await signOut(reader)
    const result = await trySignIn(reader.page, { handle: "sahayak", password: PASSWORD })
    assert.ok(!result.ok, "the Sahayak account signed in with a password")
    const rows = await query("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", BOT_ID)
    assert.equal(rows[0].n, 0, "a session was made for the Sahayak account")
  })
}

// A question is made in a post, and the answer is the one the stub gives for it. A post's mention is answered once.
async function answersMention() {
  const asker = await createUser({ tag: "sha" })
  const marker = `${RUN_ID}${randomWord(4)}`
  const body = `@sahayak what does ${marker} mean?`
  await openHome(asker.page)
  const form = homeComposer(asker.page)
  await typeIn(form, body)
  await acted(asker.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(asker.page, /^Posted\./)

  const postId = await postIdByBody(asker.handle, body)
  assert.ok(postId, "the question was not saved")

  const reply = await waitForAnswer(postId)
  assert.equal(reply.author_id, BOT_ID, "the answer was not posted by the Sahayak account")
  assert.equal(
    reply.body,
    `Sahayak answer to: what does ${marker} mean? (context posts: 0)`,
    "the answer is not the one the service gave"
  )
  assert.ok(!reply.body.includes("@"), "the answer mentions someone")

  await check("the answer shows under the question, on the question's own post page", async () => {
    await go(asker.page, `/${asker.handle}/status/${postId}`, asker.page.getByText(`Sahayak answer to: what does ${marker}`))
  })

  await check("the question is marked done, and it is not answered again", async () => {
    const jobs = await query("SELECT status FROM sahayak_jobs WHERE post_id = ?", postId)
    assert.equal(jobs.length, 1, "the question has no job")
    assert.equal(jobs[0].status, "done", `the question is ${jobs[0].status}, not done`)
    const replies = await query("SELECT COUNT(*) AS n FROM posts WHERE reply_to_id = ? AND author_id = ?", postId, BOT_ID)
    assert.equal(replies[0].n, 1, "the question was answered more than once")
  })
}

// A reply is answered with the post it replies to as context, and the answer is a reply to the reply.
async function answersInReply() {
  const writer = await createUser({ tag: "shw" })
  const asker = await createUser({ tag: "sha" })
  const marker = `${RUN_ID}${randomWord(4)}`
  const parentBody = `The river was low in March, ${marker}.`
  await openHome(writer.page)
  const form = homeComposer(writer.page)
  await typeIn(form, parentBody)
  await acted(writer.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(writer.page, /^Posted\./)
  const parentId = await postIdByBody(writer.handle, parentBody)
  assert.ok(parentId, "the post to reply to was not saved")

  const replyBody = `@sahayak is that right? ${marker}`
  await go(asker.page, `/${writer.handle}/status/${parentId}`, asker.page.getByText(parentBody).first())
  await replyButton(card(asker.page, parentBody)).click()
  const dialog = asker.page.getByRole("dialog", { name: "Reply" })
  await dialog.waitFor()
  await typeIn(dialog, replyBody)
  await acted(asker.page, () => dialog.getByRole("button", { name: "Reply", exact: true }).click())
  const askId = await postIdByBody(asker.handle, replyBody)
  assert.ok(askId, "the reply with the question was not saved")

  const answer = await waitForAnswer(askId)
  assert.equal(answer.author_id, BOT_ID, "the answer to the reply was not posted by Sahayak")
  assert.equal(
    answer.body,
    `Sahayak answer to: is that right? ${marker} (context posts: 1)`,
    "the reply was answered without the post it replies to"
  )
}

// A failure is tried again later, and nothing is posted for it until it has failed for good. The stub fails any
// question marked [fail], so this checks the first failure: the job is kept, with one attempt used and a retry set.
async function retriesFailure() {
  const asker = await createUser({ tag: "shf" })
  const body = `@sahayak [fail] ${RUN_ID}${randomWord(4)}`
  await openHome(asker.page)
  const form = homeComposer(asker.page)
  await typeIn(form, body)
  await acted(asker.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(asker.page, /^Posted\./)
  const postId = await postIdByBody(asker.handle, body)

  await check("after one failed try, the question is kept for a retry, and no answer is posted", async () => {
    const deadline = Date.now() + TIMEOUT
    let job
    while (Date.now() < deadline) {
      job = (await query("SELECT status, attempts, run_after FROM sahayak_jobs WHERE post_id = ?", postId))[0]
      if (job && job.attempts >= 1) break
      await sleep(300)
    }
    assert.ok(job && job.attempts >= 1, "the failed question was never tried")
    assert.equal(job.status, "queued", `the failed question is ${job.status}, not kept for a retry`)
    assert.ok(Number(job.run_after) > Date.now(), "the retry is not scheduled for later")
    const replies = await query("SELECT COUNT(*) AS n FROM posts WHERE reply_to_id = ? AND author_id = ?", postId, BOT_ID)
    assert.equal(replies[0].n, 0, "an answer was posted for a failed question")
  })
}

// With no key, a question is not even kept. The mention still works as a mention.
async function noAnswerWhenOff() {
  const asker = await createUser({ tag: "sho" })
  const body = `@sahayak is this on? ${RUN_ID}${randomWord(4)}`
  await openHome(asker.page)
  const form = homeComposer(asker.page)
  await typeIn(form, body)
  await acted(asker.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(asker.page, /^Posted\./)
  const postId = await postIdByBody(asker.handle, body)
  await sleep(2000)
  const jobs = await query("SELECT COUNT(*) AS n FROM sahayak_jobs WHERE post_id = ?", postId)
  assert.equal(jobs[0].n, 0, "a question was kept although Sahayak is not set up")
  const replies = await query("SELECT COUNT(*) AS n FROM posts WHERE reply_to_id = ?", postId)
  assert.equal(replies[0].n, 0, "an answer was posted although Sahayak is not set up")
}

// Waits for the answer to a question: its job is done and the reply is saved. The answer is quick, so this is short.
async function waitForAnswer(postId) {
  const deadline = Date.now() + TIMEOUT * 2
  while (Date.now() < deadline) {
    const jobs = await query("SELECT status FROM sahayak_jobs WHERE post_id = ?", postId)
    if (jobs[0]?.status === "done") break
    await sleep(300)
  }
  const replies = await query("SELECT body, author_id FROM posts WHERE reply_to_id = ?", postId)
  assert.equal(replies.length, 1, `expected one answer, found ${replies.length}`)
  return replies[0]
}
