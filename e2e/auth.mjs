// Sign-up validation, sign-in, sign-out, and two-factor sign-in (authenticator code and recovery codes).
import { area, assert, check, guard, need, note } from "./lib/harness.mjs"
import { BASE, PASSWORD, RUN_ID, TIMEOUT, randomHandle } from "./lib/env.mjs"
import { closeVisitor, newTab, newVisitor } from "./lib/browser.mjs"
import { GROWN_UP, createUser, dateBefore, fillSignup, pickBirthday, readableDate, signIn, signOut, trySignIn, trySignUp } from "./lib/accounts.mjs"
import { Authenticator } from "./lib/totp.mjs"
import { acted, bodyText, go, ready, toastText } from "./lib/ui.mjs"

const COMPOSER = "textarea[aria-label='Post text']"

async function stillOn(page, path) {
  assert.equal(new URL(page.url()).pathname, path, `expected to stay on ${path}, but the page is at ${page.url()}`)
}

function validFields(extra = {}) {
  return { name: `Check ${RUN_ID}`, handle: randomHandle("v"), birthday: GROWN_UP, password: PASSWORD, ...extra }
}

export async function run() {
  area("auth")
  await guard("sign-up rules", signUpRules)
  await guard("sign-in and sign-out on a computer", () => signInAndOut({ phone: false }))
  await guard("sign-in and sign-out on a phone", () => signInAndOut({ phone: true }))
  await guard("private pages for signed-out visitors", privatePages)
  await guard("two-factor sign-in", twoFactor)
}

// ---------------------------------------------------------------------------------------------------------------------
// Sign-up validation
// ---------------------------------------------------------------------------------------------------------------------

async function signUpRules() {
  const visitor = await newVisitor({ label: "signup" })
  const { page } = visitor
  await check("each sign-up screen states its rule in plain text, and asks one thing", async () => {
    await go(page, "/signup", page.locator("input[name=handle]"))
    for (const label of ["Name", "Handle"]) {
      await page.locator(`label[for="field-${label.toLowerCase()}"]`).waitFor()
    }
    assert.match(await bodyText(page), /3 to 15 letters/i, "the handle rule is not on the first screen")
    await page.locator("input[name=name]").fill("Rule Check")
    await page.locator("input[name=handle]").fill(randomHandle("rules"))
    await page.locator("[data-step]:visible").getByRole("button", { name: "Continue", exact: true }).click()
    await page.locator("#field-birthday").waitFor()
    assert.match(await bodyText(page), /18 or older/i, "the age rule is not on the birthday screen")
    await pickBirthday(page, GROWN_UP)
    await page.locator("[data-step]:visible").getByRole("button", { name: "Continue", exact: true }).click()
    await page.locator("input[name=password]").waitFor()
    assert.match(await bodyText(page), /8 characters/i, "the password rule is written only as a placeholder or not at all; it must be visible text")
  })

  await check("the Continue button stays off until the screen is valid, and a screen with a bad handle does not move on", async () => {
    await go(page, "/signup", page.locator("input[name=handle]"))
    const next = page.locator("[data-step]:visible").getByRole("button", { name: "Continue", exact: true })
    assert.equal(await next.isDisabled(), true, "Continue is on before the name and handle are filled in")
    await page.locator("input[name=name]").fill("Ab")
    await page.locator("input[name=handle]").fill("ab")
    await page.locator('[role="alert"]').filter({ hasText: /at least 3 characters/i }).first().waitFor({ timeout: 5000 })
    assert.equal(await next.isDisabled(), true, "Continue is on for a handle that is too short")
    await page.locator("input[name=handle]").fill("abc")
    assert.equal(await next.isDisabled(), false, "Continue stays off for a valid handle")
  })

  await check("sign-up page links to the terms and the privacy policy, and both pages open", async () => {
    await go(page, "/signup", page.locator("input[name=handle]"))
    await fillSignup(page, validFields())
    for (const [name, path] of [
      [/terms/i, "/terms"],
      [/privacy/i, "/privacy"],
    ]) {
      const link = page.getByRole("link", { name }).first()
      await link.waitFor({ timeout: 5000 })
      const href = await link.getAttribute("href")
      assert.equal(href, path, `the ${path} link points to ${href}`)
      const response = await page.request.get(`${BASE}${path}`)
      assert.equal(response.status(), 200, `${path} answers ${response.status()}`)
    }
  })

  const liveCases = [
    ["ab", /at least 3 characters/i],
    ["has space", /only letters, numbers and underscores/i],
    ["dash-name", /only letters, numbers and underscores/i],
    ["12345678", /at least 3 letters/i],
    ["a_b_c_d_e_f_g_h", /up to 5 underscores/i],
  ]
  for (const [typed, expected] of liveCases) {
    await check(`handle "${typed}" is flagged as you type`, async () => {
      await go(page, "/signup", page.locator("input[name=handle]"))
      await page.locator("input[name=handle]").fill(typed)
      await page.locator('[role="alert"]').filter({ hasText: expected }).first().waitFor({ timeout: 5000 })
    })
  }

  await check("handle field stops at 15 characters and ignores a typed @", async () => {
    await go(page, "/signup", page.locator("input[name=handle]"))
    // Typing starts once the page is running. Keys typed while it is still loading are lost when the field is set up. The
    // form's start time is written only after that, so it marks the point where typing is safe.
    await page.waitForFunction(() => (document.querySelector('input[name="stamp"]')?.value ?? "") !== "", null, { timeout: 60_000 })
    const input = page.locator("input[name=handle]")
    await input.pressSequentially("abcdefghijklmnopqrstuvwxyz")
    assert.equal((await input.inputValue()).length, 15, "the handle field accepts more than 15 characters")
    await input.fill("@@someone")
    assert.equal(await input.inputValue(), "someone", "a leading @ should be dropped, because the @ is already shown beside the field")
  })

  await check("server refuses a handle with fewer than 3 letters and keeps the form open", async () => {
    const result = await trySignUp(page, validFields({ handle: "ab" }))
    assert.equal(result.ok, false, "a 2-character handle was accepted")
    assert.match(result.error, /at least 3 characters/i)
    await stillOn(page, "/signup")
  })

  for (const reserved of ["settings", "notifications", "terms", "privacy"]) {
    await check(`server refuses the reserved handle "${reserved}"`, async () => {
      const result = await trySignUp(page, validFields({ handle: reserved }))
      assert.equal(result.ok, false, `the reserved handle ${reserved} was accepted`)
      assert.match(result.error, /reserved/i)
    })
  }

  await check("server refuses someone under 18 (turns 18 in two days)", async () => {
    const result = await trySignUp(page, validFields({ birthday: dateBefore(18, -2) }))
    assert.equal(result.ok, false, "an account for a 17 year old was created")
    assert.match(result.error, /18 or older/i)
    await stillOn(page, "/signup")
  })

  await check("server asks for a date of birth when none is chosen", async () => {
    const result = await trySignUp(page, validFields({ birthday: null }))
    assert.equal(result.ok, false, "an account without a date of birth was created")
    assert.match(result.error, /date of birth/i)
  })

  await check("server refuses a password of 7 characters", async () => {
    const result = await trySignUp(page, validFields({ password: "abc1234" }))
    assert.equal(result.ok, false, "a 7 character password was accepted")
    assert.match(result.error, /8 characters/i)
    await stillOn(page, "/signup")
  })

  await check("server refuses a password of 201 characters", async () => {
    const result = await trySignUp(page, validFields({ password: "p".repeat(201) }))
    assert.equal(result.ok, false, "a 201 character password was accepted")
    assert.match(result.error, /200/)
  })

  const adult = validFields({ handle: randomHandle("adult"), birthday: dateBefore(18, 2) })
  await check("someone who turned 18 two days ago can sign up, with an 8 character password", async () => {
    const result = await trySignUp(page, { ...adult, password: "abcd1234" })
    assert.equal(result.ok, true, `sign-up of an 18 year old failed: ${result.error}`)
    assert.equal(result.step, "welcome", "a new account did not open the setup steps")
    await page.getByRole("heading", { name: "Set up your profile" }).waitFor()
  })

  await check("the date picker shows the date that was chosen", async () => {
    const fresh = await newVisitor({ label: "picker" })
    try {
      await go(fresh.page, "/signup", fresh.page.locator("input[name=handle]"))
      await fresh.page.locator("input[name=name]").fill("Picker")
      await fresh.page.locator("input[name=handle]").fill(randomHandle("picker"))
      await fresh.page.locator("[data-step]:visible").getByRole("button", { name: "Continue", exact: true }).click()
      // Read while the birthday screen is still showing: the next screen hides it.
      await pickBirthday(fresh.page, { year: 2001, month: 1, day: 28 })
      const shown = (await fresh.page.locator("#field-birthday").innerText()).trim()
      assert.equal(shown, readableDate({ year: 2001, month: 1, day: 28 }))
      const hidden = await fresh.page.locator("input[name=birthday]").inputValue()
      assert.equal(hidden, "2001-02-28", "the form sends a different date than the one shown")
    } finally {
      await closeVisitor(fresh)
    }
  })

  await check("a handle that is taken is refused, in any letter case", async () => {
    const fresh = await newVisitor({ label: "taken" })
    try {
      const result = await trySignUp(fresh.page, { ...validFields(), handle: adult.handle.toUpperCase() })
      assert.equal(result.ok, false, "a second account was created with the same handle in capitals")
      assert.match(result.error, /taken/i)
    } finally {
      await closeVisitor(fresh)
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Sign-in and sign-out, on a computer and on a phone
// ---------------------------------------------------------------------------------------------------------------------

async function signInAndOut({ phone }) {
  const where = phone ? "phone" : "desktop"
  let user = null
  await check(`${where}: a new account lands on the home page, signed in`, async () => {
    user = await createUser({ tag: phone ? "sip" : "sid", phone })
    await user.page.locator(COMPOSER).first().waitFor()
    assert.equal(new URL(user.page.url()).pathname, "/")
    if (!phone) {
      await user.page.getByRole("link", { name: `${user.name}, your profile` }).first().waitFor()
    }
  })
  need(user, "the new account")

  await check(`${where}: signing out ends the session`, async () => {
    await signOut(user)
    await user.page.goto("/settings")
    await user.page.waitForURL((url) => url.pathname === "/login")
    await user.page.goto("/")
    await user.page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: TIMEOUT })
    assert.equal(new URL(user.page.url()).pathname, "/", "the landing page redirected away from /")
  })

  await check(`${where}: a wrong password is refused with the same words as an unknown handle`, async () => {
    const wrong = await trySignIn(user.page, { handle: user.handle, password: `${PASSWORD}-nope` })
    assert.equal(wrong.ok, false, "a wrong password was accepted")
    await stillOn(user.page, "/login")
    const unknown = await trySignIn(user.page, { handle: randomHandle("none"), password: PASSWORD })
    assert.equal(unknown.ok, false, "a handle that does not exist was accepted")
    assert.equal(unknown.error, wrong.error, "the message differs between a wrong password and an unknown handle, so it reveals which handles exist")
  })

  await check(`${where}: the right password signs in, whatever the case of the handle`, async () => {
    await signIn(user.page, { handle: user.handle.toUpperCase(), password: user.password })
    assert.equal(new URL(user.page.url()).pathname, "/")
  })

  await check(`${where}: the session survives a reload and a second tab`, async () => {
    await user.page.reload()
    await user.page.locator(COMPOSER).first().waitFor()
    const tab = await newTab(user, "second-tab")
    await tab.goto("/settings")
    await tab.getByRole("navigation", { name: "Settings sections" }).waitFor()
    assert.equal(new URL(tab.url()).pathname, "/settings")
    await tab.close()
  })

  await check(`${where}: login and sign-up pages send a signed-in person home`, async () => {
    await user.page.goto("/login")
    await user.page.waitForURL((url) => url.pathname === "/")
    await user.page.goto("/signup")
    await user.page.waitForURL((url) => url.pathname === "/")
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Pages that need an account
// ---------------------------------------------------------------------------------------------------------------------

async function privatePages() {
  const visitor = await newVisitor({ label: "signed-out" })
  // The home address is the landing page for a visitor, so it stays where it is. Every other page sends them to sign in.
  await check("signed out, / shows the landing page", async () => {
    await visitor.page.goto("/")
    await visitor.page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: TIMEOUT })
    assert.equal(new URL(visitor.page.url()).pathname, "/", "the landing page redirected away from /")
    await visitor.page.getByRole("link", { name: "Create an account" }).first().waitFor({ timeout: TIMEOUT })
  })
  for (const path of ["/explore", "/notifications", "/messages", "/bookmarks", "/lists", "/drafts", "/analytics", "/settings", "/settings/security", "/messages/new"]) {
    await check(`signed out, ${path} goes to the login page`, async () => {
      await visitor.page.goto(path)
      await visitor.page.waitForURL((url) => url.pathname === "/login", { timeout: TIMEOUT })
    })
  }
  await check("signed out, the account export refuses to answer", async () => {
    const response = await visitor.page.request.get(`${BASE}/api/account-data`)
    assert.equal(response.status(), 401, `the export answered ${response.status()} to a visitor without an account`)
  })
  await check("signed out, the live event stream refuses to open", async () => {
    const response = await visitor.page.request.get(`${BASE}/api/events`, { timeout: 8000 })
    assert.ok([401, 403].includes(response.status()), `the event stream answered ${response.status()} to a visitor without an account`)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Two-factor sign-in
// ---------------------------------------------------------------------------------------------------------------------

async function startSetup(page) {
  await go(page, "/settings/security", page.getByRole("button", { name: "Turn on two-factor sign-in" }))
  await page.getByRole("button", { name: "Turn on two-factor sign-in" }).click()
  const secretBox = page.locator("code").first()
  await secretBox.waitFor()
  const secret = (await secretBox.innerText()).replace(/\s+/g, "")
  assert.match(secret, /^[A-Z2-7]{16,}$/, `the secret shown on the page is not a base32 key: ${secret}`)
  return secret
}

async function submitSecondFactor(page, code) {
  await ready(page.locator("input[name=code]"))
  await page.locator("input[name=code]").fill(code)
  await acted(page, () => page.getByRole("button", { name: "Continue", exact: true }).click())
}

async function twoFactor() {
  const user = await createUser({ tag: "tfa" })
  const authenticator = { current: null }
  let recoveryCodes = []
  await check("two-factor: a wrong code does not turn it on", async () => {
    const secret = await startSetup(user.page)
    authenticator.current = new Authenticator(secret)
    await user.page.locator("input[name=code]").fill(authenticator.current.wrong())
    await acted(user.page, () => user.page.getByRole("button", { name: "Turn on", exact: true }).click())
    await user.page.locator('[role="alert"]').first().waitFor()
    assert.equal(await user.page.getByText("Save these recovery codes").count(), 0, "recovery codes were shown after a wrong code")
  })
  need(authenticator.current, "the authenticator secret")

  await check("two-factor: the code worked out from the secret on the page turns it on and shows recovery codes", async () => {
    await user.page.locator("input[name=code]").fill(await authenticator.current.next(note))
    await acted(user.page, () => user.page.getByRole("button", { name: "Turn on", exact: true }).click())
    await user.page.getByText("Save these recovery codes").waitFor()
    const text = await bodyText(user.page)
    recoveryCodes = text.match(/\b[a-z0-9]{4}-[a-z0-9]{4}\b/g) ?? []
    assert.ok(recoveryCodes.length >= 8, `expected a list of recovery codes, found ${recoveryCodes.length}`)
    assert.equal(new Set(recoveryCodes).size, recoveryCodes.length, "two recovery codes are the same")
    await toastText(user.page, /two-factor sign-in is on/i)
    await user.page.getByRole("button", { name: "I saved them", exact: true }).click()
    await user.page.getByText(/You have \d+ unused recovery codes? left/).first().waitFor()
  })
  need(recoveryCodes.length > 0, "recovery codes")

  await check("two-factor: signing out and in asks for the code, and a wrong code is refused", async () => {
    await signOut(user)
    const first = await trySignIn(user.page, { handle: user.handle, password: user.password })
    assert.equal(first.step, "verify", "sign-in with the right password did not ask for the second step")
    await submitSecondFactor(user.page, authenticator.current.wrong())
    await user.page.locator('[role="alert"]').first().waitFor()
    assert.equal(new URL(user.page.url()).pathname, "/login/verify")
  })

  await check("two-factor: the current code finishes the sign-in", async () => {
    await submitSecondFactor(user.page, await authenticator.current.next(note))
    await user.page.waitForURL((url) => url.pathname === "/")
    await user.page.locator(COMPOSER).first().waitFor()
  })

  await check("two-factor: the same code cannot be used twice", async () => {
    await signOut(user)
    const attempt = await trySignIn(user.page, { handle: user.handle, password: user.password })
    assert.equal(attempt.step, "verify")
    await submitSecondFactor(user.page, authenticator.current.lastCode())
    await user.page.locator('[role="alert"]').first().waitFor()
    assert.equal(new URL(user.page.url()).pathname, "/login/verify", "a code that was already used signed the person in")
  })

  await check("two-factor: a recovery code finishes the sign-in", async () => {
    await submitSecondFactor(user.page, recoveryCodes[0])
    await user.page.waitForURL((url) => url.pathname === "/")
    await user.page.locator(COMPOSER).first().waitFor()
  })

  await check("two-factor: a recovery code works once", async () => {
    await signOut(user)
    const attempt = await trySignIn(user.page, { handle: user.handle, password: user.password })
    assert.equal(attempt.step, "verify")
    await submitSecondFactor(user.page, recoveryCodes[0])
    await user.page.locator('[role="alert"]').first().waitFor()
    assert.equal(new URL(user.page.url()).pathname, "/login/verify", "a recovery code that was already used signed the person in")
    // A fresh recovery code still works, so the account is not locked out.
    await submitSecondFactor(user.page, recoveryCodes[1])
    await user.page.waitForURL((url) => url.pathname === "/")
  })

  await check("two-factor: turning it off needs the password and a code, and a wrong code is refused", async () => {
    await go(user.page, "/settings/security", user.page.getByRole("button", { name: "Turn off", exact: true }))
    const form = user.page.locator("form").filter({ has: user.page.getByRole("button", { name: "Turn off", exact: true }) })
    await form.locator("input[name=password]").fill(user.password)
    await form.locator("input[name=code]").fill(authenticator.current.wrong())
    await acted(user.page, () => form.getByRole("button", { name: "Turn off", exact: true }).click())
    await form.locator('[role="alert"]').first().waitFor()
  })

  await check("two-factor: the right password and code turn it off, and sign-in goes back to the password alone", async () => {
    const form = user.page.locator("form").filter({ has: user.page.getByRole("button", { name: "Turn off", exact: true }) })
    await form.locator("input[name=password]").fill(user.password)
    await form.locator("input[name=code]").fill(await authenticator.current.next(note))
    await acted(user.page, () => form.getByRole("button", { name: "Turn off", exact: true }).click())
    await toastText(user.page, /two-factor sign-in is off/i)
    await signOut(user)
    const attempt = await trySignIn(user.page, { handle: user.handle, password: user.password })
    assert.equal(attempt.step, "home", "sign-in still asks for a second step after two-factor was turned off")
  })

  await check("phone: the two-factor pages fit the screen", async () => {
    const phone = await createUser({ tag: "tfp", phone: true })
    try {
      await go(phone.page, "/settings/security", phone.page.getByRole("button", { name: "Turn on two-factor sign-in" }))
      await phone.page.getByRole("button", { name: "Turn on two-factor sign-in" }).click()
      await phone.page.locator("code").first().waitFor()
    } finally {
      await closeVisitor(phone)
    }
  })
}
