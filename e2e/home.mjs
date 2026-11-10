// Home tabs: a list and a followed topic pinned as tabs on Home, put in order from For you settings, and taken off again.
// The tab strip on Home is read back after each change, so the order the person set is the order they see.
import { area, check, guard } from "./lib/harness.mjs"
import { RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { acted, go, toastText } from "./lib/ui.mjs"

const LETTERS = "abcdefghijklmnopqrstuvwxyz"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

export async function run() {
  area("home")
  await guard("home tabs: pin a list and a topic, put them in order, take them off", homeTabsFlow)
}

// The tabs on Home, by their accessible names, in the order they show.
async function homeTabNames(page) {
  await go(page, "/", page.getByRole("navigation", { name: "Home sections" }))
  return page.getByRole("navigation", { name: "Home sections" }).getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")))
}

// The rows of the Home tabs editor in For you settings, by their label, in order.
async function editorOrder(page) {
  await go(page, "/settings/for-you", page.getByRole("heading", { name: "Home tabs", exact: true }))
  const rows = page.getByRole("list", { name: "Home tabs, in order" }).locator("li")
  await rows.first().waitFor()
  const texts = await rows.evaluateAll((items) => items.map((item) => item.innerText.split("\n")[0].trim()))
  return texts
}

async function homeTabsFlow() {
  const owner = await createUser({ tag: "tab" })
  const page = owner.page
  const listName = uniq("Desk")
  const tag = `htab${randomWord(5, LETTERS)}`
  let listId = null

  await check("a list is created for the Home tab test", async () => {
    await go(page, "/lists", page.getByRole("button", { name: "New list", exact: true }))
    await page.getByRole("button", { name: "New list", exact: true }).click()
    await page.locator("input[name=name]").waitFor()
    await page.locator("input[name=name]").fill(listName)
    await acted(page, () => page.getByRole("button", { name: "Create list", exact: true }).click())
    await toastText(page, /^List created/)
    await page.waitForURL((url) => /^\/lists\/[^/]+$/.test(url.pathname))
    listId = new URL(page.url()).pathname.split("/").pop()
  })

  await check("a list pins to Home from its page, and shows as a tab", async () => {
    await go(page, `/lists/${listId}`, page.getByRole("button", { name: "Pin to Home", exact: true }))
    await acted(page, () => page.getByRole("button", { name: "Pin to Home", exact: true }).click())
    await toastText(page, /Pinned to Home/)
    const names = await homeTabNames(page)
    if (!names.includes(listName)) throw new Error(`the list is not a tab on Home: ${names.join(", ")}`)
  })

  await check("a followed topic pins to Home from its filter, and shows after the list", async () => {
    await go(page, `/topics/${tag}`, page.getByRole("button", { name: `Follow the topic #${tag}` }))
    await acted(page, () => page.getByRole("button", { name: `Follow the topic #${tag}` }).click())
    await go(page, `/?topic=${tag}`, page.getByRole("button", { name: "Pin to Home", exact: true }))
    await acted(page, () => page.getByRole("button", { name: "Pin to Home", exact: true }).click())
    await toastText(page, new RegExp(`#${tag} is a tab on Home`))
    const names = await homeTabNames(page)
    const expected = ["For you", "Following", listName, `#${tag}`]
    if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`tabs on Home are ${JSON.stringify(names)}, expected ${JSON.stringify(expected)}`)
  })

  await check("the topic tab opens its own feed and offers to unpin it", async () => {
    await go(page, "/", page.getByRole("navigation", { name: "Home sections" }))
    await page.getByRole("navigation", { name: "Home sections" }).getByRole("link", { name: `#${tag}`, exact: true }).click()
    await page.waitForURL((url) => url.searchParams.get("tab") === `topic:${tag}`)
    await page.getByRole("button", { name: "Unpin from Home", exact: true }).waitFor()
  })

  await check("moving the topic up in For you settings reorders the tabs on Home", async () => {
    const before = await editorOrder(page)
    if (before[0] !== listName || before[1] !== `#${tag}`) throw new Error(`settings order is ${JSON.stringify(before)}`)
    await acted(page, () => page.getByRole("button", { name: `Move #${tag} up`, exact: true }).click())
    await page.waitForFunction(
      (label) => document.querySelector("ol[aria-label='Home tabs, in order'] li")?.innerText.split("\n")[0].trim() === label,
      `#${tag}`
    )
    const names = await homeTabNames(page)
    if (JSON.stringify(names) !== JSON.stringify(["For you", "Following", `#${tag}`, listName])) {
      throw new Error(`tabs on Home are ${JSON.stringify(names)} after the move`)
    }
  })

  await check("a tab already at the top cannot move up", async () => {
    await go(page, "/settings/for-you", page.getByRole("heading", { name: "Home tabs", exact: true }))
    const up = page.getByRole("button", { name: `Move #${tag} up`, exact: true })
    if (!(await up.isDisabled())) throw new Error("the top tab's Move up button is enabled")
  })

  await check("taking a topic off Home removes its tab, and the list stays", async () => {
    await go(page, "/settings/for-you", page.getByRole("heading", { name: "Home tabs", exact: true }))
    await acted(page, () => page.getByRole("button", { name: `Take #${tag} off Home`, exact: true }).click())
    await toastText(page, /Taken off Home/)
    const names = await homeTabNames(page)
    if (JSON.stringify(names) !== JSON.stringify(["For you", "Following", listName])) throw new Error(`tabs on Home are ${JSON.stringify(names)}`)
  })

  await check("taking the list off Home removes its tab, and leaves the list itself", async () => {
    await go(page, "/settings/for-you", page.getByRole("heading", { name: "Home tabs", exact: true }))
    await acted(page, () => page.getByRole("button", { name: `Take ${listName} off Home`, exact: true }).click())
    await toastText(page, /Taken off Home/)
    const names = await homeTabNames(page)
    if (JSON.stringify(names) !== JSON.stringify(["For you", "Following"])) throw new Error(`tabs on Home are ${JSON.stringify(names)}`)
    await go(page, `/lists/${listId}`, page.getByRole("button", { name: "Pin to Home", exact: true }))
  })
}
