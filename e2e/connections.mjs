// Connections: the setup after sign-up, Connect with its groups and reasons, Not now, the Message link, the languages
// on a profile (never the town), the Settings that keep them, the data export, the setup prompt on Home, the phone layout
// of the steps, the pages that explain it, and translation of a post in another language.
//
// Translation needs the server to run with RHENKO_TRANSLATE_URL set to a service that speaks the LibreTranslate interface.
// e2e/lib/translate-stub.mjs is one. Run the suite with E2E_TRANSLATE=1 when the server has it; without that, the check
// expects no Translate button at all. Every person here is made by the suite, with random handles.
import { assert, area, check, guard } from "./lib/harness.mjs"
import { BASE, PASSWORD, RUN_ID, TIMEOUT, randomHandle } from "./lib/env.mjs"
import { GROWN_UP, signUp } from "./lib/accounts.mjs"
import { newVisitor } from "./lib/browser.mjs"
import { readZip } from "./lib/files.mjs"
import { acted, go, gone, ready, toastText } from "./lib/ui.mjs"
import { card, homeComposer, openProfile, writePost } from "./lib/posts.mjs"

const TRANSLATE_ON = process.env.E2E_TRANSLATE === "1"
const FRENCH_POST = "Je suis très content de la nouvelle application, et je pense que les gens sont vraiment gentils avec nous."
// A town unique to this run, so accounts left by earlier runs in the same database are not the nearest people. Towns
// take letters only.
const TOWN = `Town ${RUN_ID.replace(/\d/g, "")}`
const SWAPS = "Language swaps"
const NEAR = "Near you"
const SETUP_BANNER = "Set up your connections"

// A new account in a browser of its own. With stay, the page is left on the setup steps; otherwise it goes home.
async function newAccount(tag, { phone = false, stay = false } = {}) {
  const handle = randomHandle(tag)
  const name = `${tag[0].toUpperCase()}${tag.slice(1)} ${RUN_ID}`
  const visitor = await newVisitor({ phone, label: tag })
  await signUp(visitor.page, { name, handle, birthday: GROWN_UP, password: PASSWORD }, { stay })
  return { ...visitor, tag, handle, name }
}

// Picks a language by its name: open the list ("I speak" or "I'm learning"), search for it, then press its chip.
async function pickLanguage(page, name, tab) {
  await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click()
  const search = page.locator("#language-search")
  await search.fill(name)
  await page.getByRole("list", { name: "Languages" }).getByRole("button").filter({ hasText: name }).first().click()
  await search.fill("")
}

// Languages are set in Settings, where they are changed later too. Onboarding does not ask for them.
async function setLanguages(page, { speak = [], learn = [] }) {
  await go(page, "/settings/connections", page.getByRole("button", { name: "Save languages", exact: true }))
  for (const name of speak) await pickLanguage(page, name, "I speak")
  for (const name of learn) await pickLanguage(page, name, "I'm learning")
  await acted(page, () => page.getByRole("button", { name: "Save languages", exact: true }).click())
}

// Finishes the setup screens after sign-up and opens Home. Continue on the profile moves on to Where you are, where the
// country is picked from the list under its field and the city and region are typed in. Continue there moves on to What you're into,
// where topics are picked. Languages are set in Settings first, when a check gives any.
async function setUp(page, { city, region = "", country = "Australia", speak = [], learn = [], topics = [] }) {
  if (speak.length > 0 || learn.length > 0) await setLanguages(page, { speak, learn })
  await go(page, "/welcome", page.getByRole("heading", { name: "Set up your profile" }))
  await acted(page, () => page.getByRole("button", { name: "Continue", exact: true }).click())
  await page.waitForURL((url) => url.pathname === "/welcome/location", { timeout: TIMEOUT })
  await page.getByRole("heading", { name: "Where you are", exact: true }).waitFor()
  if (city) {
    await ready(page.locator("#where-country"))
    // The country is typed into a box that opens its list under the field. The chosen name then shows in the field.
    await page.locator("#where-country").click()
    await page.locator("#where-country").fill(country)
    await page.getByRole("listbox", { name: "Countries" }).getByRole("button", { name: country, exact: true }).click()
    await page.getByRole("listbox", { name: "Countries" }).waitFor({ state: "detached" })
    await page.locator("#where-area").fill(city)
    if (region) await page.locator("#where-region").fill(region)
  }
  await acted(page, () => page.getByRole("button", { name: "Continue", exact: true }).click())
  await page.waitForURL((url) => url.pathname === "/welcome/interests", { timeout: TIMEOUT })
  await page.getByRole("heading", { name: "What you're into", exact: true }).waitFor()
  for (const tag of topics) await acted(page, () => page.getByRole("button", { name: `#${tag}`, exact: true }).click())
  await acted(page, () => page.getByRole("button", { name: "Open Rhenko", exact: true }).click())
  await page.waitForURL((url) => url.pathname === "/", { timeout: TIMEOUT })
  await homeComposer(page).waitFor()
}

// The card of one person inside one group of Connect. The handle is matched as a whole span, so @ana is not @anabel.
function cardIn(page, group, handle) {
  return page.getByRole("region", { name: group }).locator("li").filter({ has: page.getByText(`@${handle}`, { exact: true }) })
}

export async function run() {
  area("connections")
  await guard("sign-up, setup, Connect, Not now, Message, profiles, Settings and the export", connectionsFlow)
  await guard("the setup prompt on Home, and Not now", promptFlow)
  await guard("the setup steps on a phone", phoneFlow)
  await guard("the pages that explain suggestions and translation", pagesFlow)
}

async function connectionsFlow() {
  const ana = await newAccount("ana", { stay: true })
  await check("sign-up opens the profile screen, the fourth of six steps", async () => {
    assert.equal(new URL(ana.page.url()).pathname, "/welcome", "sign-up did not open the setup screen")
    await ana.page.locator('[role="progressbar"][aria-valuenow="4"][aria-valuemax="6"]').waitFor()
  })
  await check("Open Rhenko opens Home with no setup prompt left", async () => {
    await setUp(ana.page, { city: TOWN, speak: ["English"], learn: ["French"] })
    assert.equal(await gone(ana.page.getByRole("region", { name: SETUP_BANNER })), 0, "the setup prompt is still on Home after setup")
  })

  // Two more people. Ben speaks French and learns English, so he is a language swap for Ana. Cal speaks Spanish and lives
  // in the same town, so he is a person nearby.
  const ben = await newAccount("ben", { stay: true })
  await setUp(ben.page, { city: TOWN, speak: ["French"], learn: ["English"], topics: ["music"] })
  const cal = await newAccount("cal", { stay: true })
  await setUp(cal.page, { city: TOWN, speak: ["Spanish"], topics: ["music"] })

  await check("Connect groups people by why they match, and each card gives the reason", async () => {
    await go(ana.page, "/connect", ana.page.getByRole("region", { name: SWAPS }))
    assert.match(await cardIn(ana.page, SWAPS, ben.handle).innerText(), /Language swap: French for English/)
    assert.match(await cardIn(ana.page, NEAR, cal.handle).innerText(), new RegExp(`In ${TOWN}, like you`))
  })

  await check("Not now takes a suggestion away, and Settings brings it back", async () => {
    await go(ana.page, "/connect", ana.page.getByRole("region", { name: NEAR }))
    const calCard = cardIn(ana.page, NEAR, cal.handle)
    await acted(ana.page, () => calCard.getByRole("button", { name: "Not now", exact: true }).click())
    assert.equal(await gone(calCard), 0, "the card is still on Connect after Not now")

    await go(ana.page, "/settings/connections", ana.page.getByRole("heading", { name: "Not now", exact: true }))
    await ana.page.getByText("You have said not now to 1 person").waitFor()
    await acted(ana.page, () => ana.page.getByRole("button", { name: "Show them again", exact: true }).click())
    await toastText(ana.page, /^They can be suggested again/)

    await go(ana.page, "/connect", ana.page.getByRole("region", { name: NEAR }))
    assert.equal(await cardIn(ana.page, NEAR, cal.handle).count(), 1, "the person is not back on Connect after Show them again")
  })

  await check("Message opens a conversation with that person", async () => {
    await go(ana.page, "/connect", ana.page.getByRole("region", { name: SWAPS }))
    await cardIn(ana.page, SWAPS, ben.handle).getByRole("link", { name: "Message", exact: true }).click()
    await ana.page.waitForURL((url) => /^\/messages\/[^/]+$/.test(url.pathname) && url.pathname !== "/messages/new", { timeout: TIMEOUT })
  })

  // Languages sit on the About page now, under the profile. The town for suggestions is private, so it never shows there.
  await check("the About page shows the languages a person speaks, and never their town", async () => {
    await go(cal.page, `/${ana.handle}/about`, cal.page.locator("main").getByText("Speaks", { exact: true }))
    const main = cal.page.locator("main")
    await main.getByText("English (fluent)", { exact: true }).waitFor()
    await main.getByText("French", { exact: true }).waitFor()
    assert.equal((await main.innerText()).includes(TOWN), false, "the About page shows the town")
  })

  await check(
    TRANSLATE_ON ? "a post in another language can be translated when it is asked for" : "with translation off, no post offers a Translate button",
    async () => {
      await writePost(ben.page, FRENCH_POST)
      await openProfile(ana.page, ben.handle)
      const post = card(ana.page, "Je suis très content")
      await post.waitFor()
      const translate = post.getByRole("button", { name: "Translate", exact: true })
      if (!TRANSLATE_ON) {
        assert.equal(await translate.count(), 0, "a Translate button is shown although translation is off")
        return
      }
      await acted(ana.page, () => translate.click())
      await post.getByText("Translated from French").waitFor()
      await post.getByText(/\[fr→en\]/).waitFor()
    }
  )

  await check("the city from the profile screen and the languages are kept after a reload", async () => {
    await go(ana.page, "/settings/connections", ana.page.locator("#where-area"))
    assert.equal(await ana.page.locator("#where-area").inputValue(), TOWN, "the town was not kept")
    await ready(ana.page.locator("#language-partners"))
    // The switch is a visually hidden checkbox inside its row, so the row is pressed, the way a person presses it.
    await ana.page.locator('label[for="language-partners"]').click()
    assert.equal(await ana.page.locator("#language-partners").isChecked(), false, "the switch did not turn off")
    await acted(ana.page, () => ana.page.getByRole("button", { name: "Save languages", exact: true }).click())
    await toastText(ana.page, /^Saved your languages/)

    await go(ana.page, "/settings/connections", ana.page.locator("#language-partners"))
    assert.equal(await ana.page.locator("#language-partners").isChecked(), false, "the switch came back on after a reload")
  })

  await check("with language suggestions off, Connect says so and offers no language swaps", async () => {
    await go(ana.page, "/connect", ana.page.getByRole("link", { name: "Where and languages", exact: true }))
    assert.equal(await gone(ana.page.getByRole("region", { name: SWAPS })), 0, "a language swap is still suggested")
    await ana.page.getByText("Language suggestions are off.", { exact: true }).waitFor()
  })

  await check("the data export lists the connection choices", async () => {
    const response = await ana.page.context().request.get(`${BASE}/api/account-data`)
    assert.equal(response.status(), 200, "the export did not download")
    const data = JSON.parse(readZip(await response.body()).get("data.json").toString("utf8"))
    const connections = data.connections
    assert.equal(connections.where.cityOrTown, TOWN)
    assert.equal(connections.where.countryName, "Australia")
    assert.equal(connections.suggestLanguagePartners, false)
    assert.equal(connections.setup, "done")
    assert.deepEqual(connections.languages.speak.map((item) => item.code), ["en"])
    assert.deepEqual(connections.languages.learn.map((item) => item.code), ["fr"])
    assert.deepEqual(connections.notNow, [])
  })
}

async function promptFlow() {
  const dave = await newAccount("dave")
  await check("a new account sees the setup prompt on Home", async () => {
    await dave.page.getByRole("region", { name: SETUP_BANNER }).waitFor()
    await dave.page.getByRole("link", { name: "Set up", exact: true }).waitFor()
  })
  await check("Not now hides the prompt, and Connect says where to start", async () => {
    await acted(dave.page, () => dave.page.getByRole("region", { name: SETUP_BANNER }).getByRole("button", { name: "Not now", exact: true }).click())
    await go(dave.page, "/", homeComposer(dave.page))
    assert.equal(await gone(dave.page.getByRole("region", { name: SETUP_BANNER })), 0, "the prompt is back after Not now")
    // Nothing matches Dave yet, so Connect shows people to start with, and says what is missing.
    await go(dave.page, "/connect", dave.page.getByRole("region", { name: "People to start with" }))
    await dave.page.getByRole("region", { name: "People to start with" }).locator("li").first().waitFor()
    await dave.page.getByText("Add your city or town to see people nearby.", { exact: true }).waitFor()
  })
}

async function phoneFlow() {
  const pam = await newAccount("pam", { phone: true, stay: true })
  await check("the setup steps fit a phone, and can be skipped", async () => {
    await setUp(pam.page, { city: "Sydney" })
  })
}

async function pagesFlow() {
  const reader = await newVisitor({ label: "reader" })
  await check("the transparency page explains how people are suggested, and how translation works", async () => {
    await go(reader.page, "/transparency", reader.page.getByRole("heading", { name: "How people are suggested to connect" }))
    await reader.page.getByRole("heading", { name: "How translation works" }).waitFor()
  })
  await check("the privacy page says where a person is kept, and what the languages are for", async () => {
    await go(reader.page, "/privacy", reader.page.getByText("Where you are.", { exact: true }))
    await reader.page.getByText("Translations.", { exact: true }).waitFor()
  })
}
