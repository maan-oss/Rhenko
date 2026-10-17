// Passkeys and security keys. A key is added in Settings → Security. A passkey then signs the account in on its own from
// the login page. A key also stands in for the authenticator code as the second step after a password. A virtual
// authenticator, which behaves like a fingerprint reader or a security key, does the signing in this browser.
import { area, assert, check, guard, note } from "./lib/harness.mjs"
import { createUser, signOut, trySignIn } from "./lib/accounts.mjs"
import { query } from "./lib/db.mjs"
import { Authenticator } from "./lib/totp.mjs"
import { acted, go, toastText } from "./lib/ui.mjs"

const COMPOSER = "textarea[aria-label='Post text']"
const KEYS_HEADING = "Passkeys and security keys"

export async function run() {
  area("passkeys")
  await guard("a passkey is added in Settings, and signs the account in from the login page alone", passkeySignIn)
  await guard("a security key is the second step after a password when two-factor is on", securityKeySecondStep)
}

// A virtual authenticator for this browser page: it keeps the keys made on the page and answers the sign-in prompts.
async function virtualKey(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return { cdp, authenticatorId }
}

async function addKey(page, name) {
  await go(page, "/settings/security", page.getByRole("heading", { name: KEYS_HEADING }))
  await page.getByLabel("Name for this key").fill(name)
  await page.getByRole("button", { name: "Add a passkey or key", exact: true }).click()
  await toastText(page, /Key added/)
  await page.getByText(name, { exact: true }).first().waitFor()
}

async function passkeySignIn() {
  const user = await createUser({ tag: "pks" })
  await virtualKey(user.page)

  await check("a passkey is added from Settings and listed with its name", async () => {
    await addKey(user.page, "Test laptop")
    const rows = await query(
      "SELECT COUNT(*) AS n FROM passkeys WHERE user_id = (SELECT id FROM users WHERE handle = ?)",
      user.handle
    )
    assert.equal(rows[0].n, 1, "the key was not saved")
  })

  await check("signed out, the login page signs the account in with the passkey alone", async () => {
    await signOut(user)
    await go(user.page, "/login", user.page.getByRole("button", { name: "Sign in with a passkey" }))
    await user.page.getByRole("button", { name: "Sign in with a passkey" }).click()
    await user.page.waitForURL((url) => url.pathname === "/")
    await user.page.locator(COMPOSER).first().waitFor()
  })

  await check("a passkey use is recorded with its time", async () => {
    const rows = await query(
      "SELECT last_used_at AS used FROM passkeys WHERE user_id = (SELECT id FROM users WHERE handle = ?)",
      user.handle
    )
    assert.ok(rows[0].used !== null, "the key does not show a use")
  })

  await check("a key can be removed, and then it no longer signs in", async () => {
    await go(user.page, "/settings/security", user.page.getByRole("heading", { name: KEYS_HEADING }))
    await user.page.getByRole("button", { name: "Remove Test laptop" }).click()
    await user.page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click()
    await user.page.getByText("No passkeys or security keys yet.").waitFor()
    await signOut(user)
    await go(user.page, "/login", user.page.getByRole("button", { name: "Sign in with a passkey" }))
    await user.page.getByRole("button", { name: "Sign in with a passkey" }).click()
    await user.page.getByRole("alert").first().waitFor()
    assert.equal(new URL(user.page.url()).pathname, "/login", "a removed key still signed the account in")
  })
}

async function turnOnTwoFactor(page) {
  await go(page, "/settings/security", page.getByRole("button", { name: "Turn on two-factor sign-in" }))
  await page.getByRole("button", { name: "Turn on two-factor sign-in" }).click()
  const box = page.locator("code").first()
  await box.waitFor()
  const secret = (await box.innerText()).replace(/\s+/g, "")
  assert.match(secret, /^[A-Z2-7]{16,}$/, `the secret shown on the page is not a base32 key: ${secret}`)
  return secret
}

async function securityKeySecondStep() {
  const user = await createUser({ tag: "pkt" })
  await virtualKey(user.page)

  await check("two-factor is turned on with an authenticator app", async () => {
    const secret = await turnOnTwoFactor(user.page)
    const authenticator = new Authenticator(secret)
    await user.page.locator("input[name=code]").fill(await authenticator.next(note))
    await acted(user.page, () => user.page.getByRole("button", { name: "Turn on", exact: true }).click())
    await user.page.getByText("Save these recovery codes").waitFor()
    await user.page.getByRole("button", { name: "I saved them", exact: true }).click()
  })

  await check("a security key is added after two-factor is on", async () => {
    await addKey(user.page, "Security key")
  })

  await check("after a password, the second step offers the key, and the key finishes the sign-in", async () => {
    await signOut(user)
    const first = await trySignIn(user.page, { handle: user.handle, password: user.password })
    assert.equal(first.step, "verify", "sign-in with the right password did not ask for the second step")
    await user.page.getByRole("button", { name: "Use a passkey or security key" }).click()
    await user.page.waitForURL((url) => url.pathname === "/")
    await user.page.locator(COMPOSER).first().waitFor()
  })
}
