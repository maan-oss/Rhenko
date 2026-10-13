// The account itself: email (add, confirm with a mailed code, change, remove), forgot-password end to end, the data
// export (a ZIP whose data.json is read), deactivate and sign in again, and delete.
// The mailed codes are read from a mail log in the "[mail] to <address>: <subject>" format: the server's own output (no mail
// server set up, outside production), or the log of the SMTP sink the server sends through (MAIL_LOG). Without either, the
// mail checks fail with that message instead of passing on nothing.
import fs from "node:fs"
import { area, assert, check, guard, need, note } from "./lib/harness.mjs"
import { BASE, PASSWORD, RUN_ID, escapeRegExp, randomHandle, randomWord, sleep } from "./lib/env.mjs"
import { closeVisitor, newVisitor } from "./lib/browser.mjs"
import { GROWN_UP, createUser, signIn, signInElsewhere, signUp, trySignIn, trySignUp } from "./lib/accounts.mjs"
import { makePng, readZip } from "./lib/files.mjs"
import { mailCount, mailReadable, mailedCode, markLog } from "./lib/mail.mjs"
import { addMutedWord, follow, unfollowButton } from "./lib/people.mjs"
import { attach, cardPostId, homeComposer, noPost, openHome, openProfile, typeIn, waitForPost, writePost } from "./lib/posts.mjs"
import { openSection } from "./lib/settings.mjs"
import { acted, alertText, bodyText, fillField, formWithButton, go, missingHandle, notHere, ready, toastText } from "./lib/ui.mjs"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

export async function run() {
  area("account")
  await guard("email, confirmation and forgot-password", emailFlow)
  await guard("data export", exportFlow)
  await guard("deactivate and sign in again", deactivateFlow)
  await guard("delete the account", deleteFlow)
}

// A six-digit code that is not the real one.
function wrongCodeFor(code) {
  return code === "000000" ? "111111" : "000000"
}

// ---------------------------------------------------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------------------------------------------------

// Sends the add-an-address (or change-address) form on the Account page. Returns the form, for reading an error from it.
async function sendCode(page, { email, password }) {
  const form = formWithButton(page, "Send code")
  await fillField(form, "email", email)
  await fillField(form, "password", password)
  await acted(page, () => form.getByRole("button", { name: "Send code", exact: true }).click())
  return form
}

// Types the mailed code into the Confirm box.
async function confirmCode(page, code) {
  const form = formWithButton(page, "Confirm")
  await fillField(form, "code", code)
  await acted(page, () => form.getByRole("button", { name: "Confirm", exact: true }).click())
  return form
}

// The forgot-password page, once, for a handle or an email. The answer is the same whoever it is.
async function requestReset(page, account) {
  await go(page, "/forgot-password", page.locator("input[name=account]"))
  const form = formWithButton(page, "Send code")
  await fillField(form, "account", account)
  await acted(page, () => form.getByRole("button", { name: "Send code", exact: true }).click())
  await page.getByText("If the account has a verified email, a code is on its way.").waitFor()
}

// The reset-password page: the email (when it is not filled in already), the mailed code and the new password.
async function setNewPassword(page, { email, code, password }) {
  const form = formWithButton(page, "Set new password")
  if (email !== undefined) await fillField(form, "email", email)
  await fillField(form, "code", code)
  await fillField(form, "password", password)
  await acted(page, () => form.getByRole("button", { name: "Set new password", exact: true }).click())
  return form
}

// A new account that gave an email address on the sign-up form.
async function signUpWithEmail({ tag, email }) {
  const handle = randomHandle(tag)
  const name = `${tag[0].toUpperCase()}${tag.slice(1)} ${RUN_ID}`
  const visitor = await newVisitor({ label: tag })
  await signUp(visitor.page, { name, handle, birthday: GROWN_UP, password: PASSWORD, email })
  return { ...visitor, tag, handle, name, password: PASSWORD, birthday: GROWN_UP }
}

async function emailFlow() {
  const user = await createUser({ tag: "eml" })
  const { page } = user
  const address = `${user.handle}@example.test`
  const changed = `${user.handle}.b@example.test`
  const fresh = `${PASSWORD}-reset`
  let sentAt = 0
  let canMail = false

  await check("email: the server can send mail, and the Account page offers to add an address", async () => {
    const problem = mailReadable()
    assert.equal(problem, null, problem ?? "")
    await openSection(page, "Account")
    const text = await bodyText(page)
    assert.ok(
      !/Email isn't set up on this server/.test(text),
      "the Email section says email is not set up on this server. Start the server outside production mode (it prints the mail to its log), or set RHENKO_SMTP_URL, before running the email checks"
    )
    await page.getByText("No email yet.").waitFor()
    canMail = true
  })
  need(canMail, "a server that can send mail and a readable mail log (SERVER_LOG or MAIL_LOG)")

  await check("email: a sloppy address and a wrong password are refused, and no mail goes out", async () => {
    const mark = markLog()
    let form = await sendCode(page, { email: "someone@localhost", password: user.password })
    assert.match(await alertText(form), /full email address/)
    form = await sendCode(page, { email: address, password: `${PASSWORD}-wrong` })
    assert.match(await alertText(form), /isn't your current password/)
    await sleep(1500)
    assert.equal(mailCount(address, mark), 0, "a code was mailed although the password was wrong")
  })

  let mailed = null
  await check("email: adding an address mails a six-digit code and the panel asks for it", async () => {
    const mark = markLog()
    await sendCode(page, { email: address, password: user.password })
    sentAt = Date.now()
    await toastText(page, new RegExp(`^Code sent to ${escapeRegExp(address)}`))
    await page.getByText(`We sent a 6-digit code to ${address}`).waitFor()
    mailed = await mailedCode(address, mark, { subject: /verification/i })
    assert.match(mailed.code, /^\d{6}$/)
    assert.match(mailed.body, new RegExp(`@${escapeRegExp(user.handle)}`), "the mail does not say which account it is for")
  })
  need(mailed, "the mailed code")

  await check("email: a wrong code is refused and counts one of five tries", async () => {
    const form = await confirmCode(page, wrongCodeFor(mailed.code))
    assert.match(await alertText(form), /isn't right\. 4 tries left\./)
  })

  await check("email: asking for another code within a minute is refused with the time to wait", async () => {
    await acted(page, () => page.getByRole("button", { name: "Send a new code", exact: true }).click())
    const message = await alertText(page, { match: /less than a minute ago/ })
    assert.match(message, /Wait \d+ seconds? before sending another/)
  })

  await check("email: the code from the mail confirms the address, and the page says so", async () => {
    await confirmCode(page, mailed.code)
    await toastText(page, new RegExp(`${escapeRegExp(address)} is verified\\.`))
    await page.getByText("Verified", { exact: true }).first().waitFor()
    await page.getByText(address, { exact: true }).waitFor()
    await page.getByRole("button", { name: "Change email", exact: true }).waitFor()
    await page.getByRole("button", { name: "Remove email", exact: true }).waitFor()
    await openSection(page, "Account")
    await page.getByText("Verified", { exact: true }).first().waitFor()
  })

  await check("email: an address that is verified on one account is refused for another", async () => {
    const visitor = await newVisitor({ label: "same-address" })
    const result = await trySignUp(visitor.page, { name: `Same ${RUN_ID}`, handle: randomHandle("same"), birthday: GROWN_UP, password: PASSWORD, email: address })
    assert.equal(result.ok, false, "a second account was made with an address that is already verified")
    assert.match(result.error, /already used by another account/)
    await closeVisitor(visitor)
  })

  // ------------------------------------------------------------------------------------------------ forgot password
  const out = await newVisitor({ label: "forgot-password" })

  await check("forgot password: an unknown email gets the same answer, and nothing is mailed", async () => {
    const stranger = `nobody-${randomWord(8)}@example.test`
    const mark = markLog()
    await requestReset(out.page, stranger)
    await sleep(2500)
    assert.equal(mailCount(stranger, mark), 0, "a reset mail went to an address that has no account")
  })

  let resetCode = null
  await check("forgot password: a verified email gets a code, and the page links to the box for it", async () => {
    const mark = markLog()
    await requestReset(out.page, address)
    resetCode = (await mailedCode(address, mark, { subject: /reset/i })).code
    await out.page.getByRole("link", { name: "Enter the code", exact: true }).click()
    await out.page.waitForURL((url) => url.pathname === "/reset-password")
    assert.equal(new URL(out.page.url()).searchParams.get("email"), address, "the link does not carry the email to the next page")
    const field = out.page.locator("input[name=email]")
    await ready(field)
    assert.equal(await field.inputValue(), address, "the email is not filled in on the reset page")
  })
  need(resetCode, "the reset code")

  await check("forgot password: a wrong code is refused and the page stays", async () => {
    const form = await setNewPassword(out.page, { code: wrongCodeFor(resetCode), password: fresh })
    assert.match(await alertText(form), /isn't right, or it has expired/)
    assert.equal(new URL(out.page.url()).pathname, "/reset-password")
  })

  await check("forgot password: the right code sets the new password, ends every session and says so on the login page", async () => {
    await setNewPassword(out.page, { code: resetCode, password: fresh })
    await out.page.waitForURL((url) => url.pathname === "/login")
    await out.page.getByText("Your password is changed and every device was signed out.").waitFor()
    await page.goto("/settings")
    await page.waitForURL((url) => url.pathname === "/login")
  })

  await check("forgot password: the same code cannot be used a second time", async () => {
    await go(out.page, `/reset-password?email=${encodeURIComponent(address)}`, out.page.locator("input[name=code]"))
    const form = await setNewPassword(out.page, { code: resetCode, password: `${fresh}-again` })
    assert.match(await alertText(form), /isn't right, or it has expired/)
  })

  await check("forgot password: the old password is refused and the new one signs in", async () => {
    const old = await trySignIn(out.page, { handle: user.handle, password: user.password })
    assert.equal(old.ok, false, "the old password still signs in after a reset")
    const renewed = await trySignIn(out.page, { handle: user.handle, password: fresh })
    assert.equal(renewed.ok, true, `the new password does not sign in: ${renewed.error}`)
    user.password = fresh
  })

  await check("email: Change email keeps the old address until the code sent to the new one is confirmed", async () => {
    // The server sends one verification code a minute per account.
    const wait = sentAt + 61_000 - Date.now()
    if (wait > 0) {
      note(`waiting ${Math.ceil(wait / 1000)} seconds: one verification code a minute per account`)
      await sleep(wait)
    }
    await signIn(page, { handle: user.handle, password: user.password })
    await openSection(page, "Account")
    await page.getByRole("button", { name: "Change email", exact: true }).click()
    const mark = markLog()
    await sendCode(page, { email: changed, password: user.password })
    await page.getByText(`We sent a 6-digit code to ${changed}`).waitFor()
    await page.getByText(address, { exact: true }).waitFor()
    const code = (await mailedCode(changed, mark, { subject: /verification/i })).code
    await confirmCode(page, code)
    await toastText(page, new RegExp(`${escapeRegExp(changed)} is verified\\.`))
    // The panel shows the new address while it waits for the code too, so the proof is that the old one is gone.
    await page.getByText(address, { exact: true }).waitFor({ state: "detached" })
    await page.getByText(changed, { exact: true }).waitFor()
    await page.getByText("Verified", { exact: true }).first().waitFor()
  })

  // ------------------------------------------------------------------------------------------------ email given at sign-up
  const secondAddress = `${randomHandle("em2")}@example.test`
  const second = await signUpWithEmail({ tag: "em2", email: secondAddress })

  await check("email at sign-up: the address is kept and shows Not verified, with a button to verify it", async () => {
    await openSection(second.page, "Account")
    await second.page.getByText(secondAddress, { exact: true }).waitFor()
    await second.page.getByText("Not verified", { exact: true }).waitFor()
    await second.page.getByRole("button", { name: "Send a code to verify it", exact: true }).waitFor()
  })

  await check("forgot password: an address that is not verified yet gets nothing", async () => {
    const mark = markLog()
    await requestReset(out.page, second.handle)
    await sleep(2500)
    assert.equal(mailCount(secondAddress, mark), 0, "a reset mail went to an address that was never verified")
  })

  await check("email at sign-up: Send a code to verify it mails a code and Confirm verifies the address", async () => {
    const mark = markLog()
    await openSection(second.page, "Account")
    await acted(second.page, () => second.page.getByRole("button", { name: "Send a code to verify it", exact: true }).click())
    await toastText(second.page, new RegExp(`^Code sent to ${escapeRegExp(secondAddress)}`))
    const { code } = await mailedCode(secondAddress, mark, { subject: /verification/i })
    await confirmCode(second.page, code)
    await toastText(second.page, new RegExp(`${escapeRegExp(secondAddress)} is verified\\.`))
    await second.page.getByText("Verified", { exact: true }).first().waitFor()
  })

  await check("forgot password by handle: the page does not know the email, so the email is typed in, and the code works", async () => {
    const mark = markLog()
    await requestReset(out.page, second.handle)
    const { code } = await mailedCode(secondAddress, mark, { subject: /reset/i })
    await out.page.getByRole("link", { name: "Enter the code", exact: true }).click()
    await out.page.waitForURL((url) => url.pathname === "/reset-password")
    assert.equal(new URL(out.page.url()).searchParams.get("email"), null)
    await setNewPassword(out.page, { email: secondAddress, code, password: fresh })
    await out.page.waitForURL((url) => url.pathname === "/login")
    second.password = fresh
  })

  await check("email: Remove email asks for the password, and then no reset mail goes anywhere", async () => {
    await signIn(second.page, { handle: second.handle, password: second.password })
    await openSection(second.page, "Account")
    await second.page.getByRole("button", { name: "Remove email", exact: true }).click()
    const form = formWithButton(second.page, "Remove email")
    await fillField(form, "password", `${PASSWORD}-wrong`)
    await acted(second.page, () => form.getByRole("button", { name: "Remove email", exact: true }).click())
    assert.match(await alertText(form), /isn't your current password/)
    await fillField(form, "password", second.password)
    await acted(second.page, () => form.getByRole("button", { name: "Remove email", exact: true }).click())
    await toastText(second.page, /^Email removed\./)
    await second.page.getByText("No email yet.").waitFor()
    const mark = markLog()
    await requestReset(out.page, secondAddress)
    await sleep(2500)
    assert.equal(mailCount(secondAddress, mark), 0, "a reset mail went to an address that was removed from the account")
  })

  await check("phone: the Email section fits the screen while it waits for a code", async () => {
    const phone = await createUser({ tag: "emp", phone: true })
    const mark = markLog()
    await openSection(phone.page, "Account")
    await sendCode(phone.page, { email: `${phone.handle}@example.test`, password: phone.password })
    await phone.page.getByText(/We sent a 6-digit code to/).waitFor()
    await mailedCode(`${phone.handle}@example.test`, mark, { subject: /verification/i })
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// The data export
// ---------------------------------------------------------------------------------------------------------------------

const IMAGE_SIGNATURES = [
  [0x89, 0x50, 0x4e, 0x47],
  [0xff, 0xd8, 0xff],
  [0x52, 0x49, 0x46, 0x46],
]

async function exportFlow() {
  const user = await createUser({ tag: "exp" })
  const friend = await createUser({ tag: "exf" })
  const { page } = user
  const text = uniq("Export post")
  const withPicture = uniq("Export picture")
  const draft = uniq("Export draft")
  const word = `exportword${randomWord(3)}`

  await check("export: set-up: a post, a picture post, a draft, a muted word and a follow", async () => {
    await writePost(page, text)
    await openHome(page)
    const form = homeComposer(page)
    await attach(form, makePng("export-picture.png", { seed: 7 }))
    await form.locator('img[alt="Selected image"]').waitFor()
    await typeIn(form, withPicture)
    await acted(page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(page, /^Posted\./)
    await openHome(page)
    await typeIn(homeComposer(page), draft)
    await acted(page, () => homeComposer(page).getByRole("button", { name: "Save draft" }).click())
    await toastText(page, /Saved to drafts/)
    await addMutedWord(page, word)
    await follow(page, friend.handle)
  })

  let entries = null
  let data = null
  await check("export: Download your data saves a ZIP named after the account, and its data.json is valid JSON", async () => {
    await openSection(page, "Account")
    const button = page.getByRole("button", { name: "Download your data", exact: true })
    await ready(button)
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), button.click()])
    assert.equal(download.suggestedFilename(), `rhenko-${user.handle}-data.zip`)
    await toastText(page, /^Your data is ready: /)
    const file = await download.path()
    assert.ok(file, "the browser did not keep the downloaded file")
    entries = readZip(fs.readFileSync(file))
    assert.ok(entries.has("data.json"), `the ZIP has no data.json; it holds: ${[...entries.keys()].join(", ")}`)
    assert.ok(entries.has("media/"), "the ZIP has no media folder")
    data = JSON.parse(entries.get("data.json").toString("utf8"))
  })
  need(data, "the parsed data.json")

  await check("export: data.json holds the profile, the posts with their state, the muted word and the follow", async () => {
    assert.equal(data.profile.handle, user.handle)
    assert.equal(data.profile.name, user.name)
    assert.equal(data.profile.protected, false)
    const published = data.posts.find((post) => post.text === text)
    assert.ok(published, "the published post is not in data.json")
    assert.equal(published.state, "published")
    const saved = data.posts.find((post) => post.text === draft)
    assert.ok(saved, "the draft is not in data.json")
    assert.equal(saved.state, "draft")
    assert.ok(
      data.mutedWords.some((entry) => entry.word === word),
      "the muted word is not in data.json"
    )
    assert.ok(
      data.following.some((entry) => entry.handle === friend.handle),
      "the followed account is not in data.json"
    )
  })

  await check("export: the picture of a post is in the ZIP under media/, and data.json points to it", async () => {
    const post = data.posts.find((item) => item.text === withPicture)
    assert.ok(post, "the picture post is not in data.json")
    assert.equal(post.media.length, 1)
    const name = post.media[0].file
    assert.match(String(name), /^media\//, `data.json does not point into media/: ${name}`)
    assert.ok(entries.has(name), `${name} is not in the ZIP`)
    const bytes = entries.get(name)
    assert.ok(
      IMAGE_SIGNATURES.some((signature) => signature.every((byte, index) => bytes[index] === byte)),
      `${name} in the ZIP is not a picture file`
    )
  })

  await check("export: the file holds no password hash, authenticator key or session token", async () => {
    const json = entries.get("data.json").toString("utf8")
    assert.doesNotMatch(json, /password_hash|totp|recovery_code|token_hash|\$argon|scrypt/i, "data.json carries something secret")
    assert.equal(Object.keys(data.profile).some((key) => /password|secret|token/i.test(key)), false, "the profile in data.json has a secret field")
  })

  await check("export: the download answers as a ZIP that is not cached, and signed-out visitors get nothing", async () => {
    const response = await page.request.get(`${BASE}/api/account-data`)
    assert.equal(response.status(), 200)
    assert.match(response.headers()["content-type"] ?? "", /application\/zip/)
    assert.match(response.headers()["content-disposition"] ?? "", /attachment/)
    assert.match(response.headers()["cache-control"] ?? "", /no-store/)
    const visitor = await newVisitor({ label: "export-signed-out" })
    const refused = await visitor.page.request.get(`${BASE}/api/account-data`)
    assert.equal(refused.status(), 401)
    await closeVisitor(visitor)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Deactivate and sign in again
// ---------------------------------------------------------------------------------------------------------------------

async function deactivateFlow() {
  const user = await createUser({ tag: "dea" })
  const watcher = await createUser({ tag: "deo" })
  const text = uniq("Before deactivating")
  await writePost(user.page, text)
  await follow(watcher.page, user.handle)
  let id = null
  let second = null

  await check("deactivate: before it, the profile and the post open for other people", async () => {
    await openProfile(watcher.page, user.handle)
    id = await cardPostId(await waitForPost(watcher.page, text))
    second = await signInElsewhere(user, { label: "dea-second" })
  })
  need(id, "the post's id")

  await check("deactivate: a wrong password is refused and the account stays as it was", async () => {
    await openSection(user.page, "Account")
    const form = formWithButton(user.page, "Deactivate account")
    await fillField(form, "password", `${PASSWORD}-wrong`)
    await acted(user.page, () => form.getByRole("button", { name: "Deactivate account", exact: true }).click())
    assert.match(await alertText(form), /isn't your current password/)
    assert.equal(new URL(user.page.url()).pathname, "/settings/account")
  })

  await check("deactivate: the right password signs out every device and says the account is hidden", async () => {
    const form = formWithButton(user.page, "Deactivate account")
    await fillField(form, "password", user.password)
    await acted(user.page, () => form.getByRole("button", { name: "Deactivate account", exact: true }).click())
    await user.page.waitForURL((url) => url.pathname === "/login")
    await user.page.getByText("Your account is deactivated and hidden.").waitFor()
    await second.page.goto("/")
    await second.page.waitForURL((url) => url.pathname === "/login")
  })

  await check("deactivate: the profile and the post answer 404 to other people, and the Following feed drops the post", async () => {
    const unknown = await notHere(watcher.page, `/${missingHandle()}`)
    assert.equal(await notHere(watcher.page, `/${user.handle}`), unknown, "the profile of a deactivated account still opens")
    assert.equal(await notHere(watcher.page, `/${user.handle}/status/${id}`), unknown, "the post of a deactivated account still opens")
    assert.equal((await bodyText(watcher.page)).includes(text), false, "the post text is on the 404 page")
    await openHome(watcher.page, "following")
    assert.equal(await noPost(watcher.page, text), true, "the post of a deactivated account is in the Following feed")
  })

  await check("deactivate: signing in again reactivates the account, the post and the follow", async () => {
    await signIn(user.page, { handle: user.handle, password: user.password })
    await openProfile(watcher.page, user.handle)
    await waitForPost(watcher.page, text)
    await unfollowButton(watcher.page, user.handle).waitFor()
    await openHome(watcher.page, "following")
    await waitForPost(watcher.page, text)
    const open = await watcher.page.goto(`/${user.handle}/status/${id}`)
    assert.equal(open.status(), 200)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------------------------------------------------

async function deleteFlow() {
  const user = await createUser({ tag: "del" })
  const watcher = await createUser({ tag: "dlo" })
  const text = uniq("Before deleting")
  const withPicture = uniq("Picture before deleting")
  await writePost(user.page, text)
  await openHome(user.page)
  const composer = homeComposer(user.page)
  await attach(composer, makePng("delete-picture.png", { seed: 9 }))
  await composer.locator('img[alt="Selected image"]').waitFor()
  await typeIn(composer, withPicture)
  await acted(user.page, () => composer.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(user.page, /^Posted\./)
  await follow(watcher.page, user.handle)

  let id = null
  let mediaPath = null
  await check("delete: before it, the post, its picture file and the profile open for other people", async () => {
    await openProfile(watcher.page, user.handle)
    id = await cardPostId(await waitForPost(watcher.page, text))
    const shown = await waitForPost(watcher.page, withPicture)
    mediaPath = await shown.locator('img[src^="/media/"]').first().getAttribute("src")
    assert.ok(mediaPath, "the picture post has no /media/ picture")
    const file = await watcher.page.request.get(`${BASE}${mediaPath}`)
    assert.equal(file.status(), 200, "the picture file does not open before the account is deleted")
  })
  need(id && mediaPath, "the post and picture links")

  await check("delete: the handle typed wrongly and a wrong password are refused", async () => {
    await openSection(user.page, "Account")
    const form = formWithButton(user.page, "Delete account forever")
    await fillField(form, "password", user.password)
    await fillField(form, "confirm", "@somebody_else")
    await acted(user.page, () => form.getByRole("button", { name: "Delete account forever", exact: true }).click())
    assert.match(await alertText(form), new RegExp(`Type @${escapeRegExp(user.handle)}`))
    await fillField(form, "password", `${PASSWORD}-wrong`)
    await fillField(form, "confirm", `@${user.handle}`)
    await acted(user.page, () => form.getByRole("button", { name: "Delete account forever", exact: true }).click())
    assert.match(await alertText(form, { match: /current password/ }), /isn't your current password/)
    assert.equal(new URL(user.page.url()).pathname, "/settings/account")
  })

  await check("delete: the right handle and password delete the account and the page says so", async () => {
    const form = formWithButton(user.page, "Delete account forever")
    await fillField(form, "password", user.password)
    await fillField(form, "confirm", `@${user.handle}`)
    await acted(user.page, () => form.getByRole("button", { name: "Delete account forever", exact: true }).click())
    await user.page.waitForURL((url) => url.pathname === "/signup")
    await user.page.getByText("Your account is deleted, along with its posts, messages and media.").waitFor()
  })

  await check("delete: the profile, the posts and the picture file are gone for other people", async () => {
    const unknown = await notHere(watcher.page, `/${missingHandle()}`)
    assert.equal(await notHere(watcher.page, `/${user.handle}`), unknown, "the profile of a deleted account still opens")
    assert.equal(await notHere(watcher.page, `/${user.handle}/status/${id}`), unknown, "a post of a deleted account still opens")
    const file = await watcher.page.request.get(`${BASE}${mediaPath}`)
    assert.equal(file.status(), 404, "the picture file of a deleted account is still served")
    await openHome(watcher.page, "following")
    assert.equal(await noPost(watcher.page, text), true, "a post of a deleted account is in the Following feed")
  })

  await check("delete: the old sign-in no longer works, and the handle can be taken again by a new account with no posts", async () => {
    const attempt = await trySignIn(user.page, { handle: user.handle, password: user.password })
    assert.equal(attempt.ok, false, "a deleted account still signs in")
    const again = await trySignUp(user.page, { name: user.name, handle: user.handle, birthday: GROWN_UP, password: PASSWORD })
    assert.equal(again.ok, true, `the handle of a deleted account cannot be taken again: ${again.error}`)
    await openProfile(watcher.page, user.handle)
    await watcher.page.getByText("No posts yet").first().waitFor()
    assert.equal(await noPost(watcher.page, text, 500), true, "the new account shows the old account's post")
  })
}
