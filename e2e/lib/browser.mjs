// Launches the browser and opens contexts. One context is one person on one device: its own cookies and its own address.
import { chromium } from "playwright-core"
import { BASE, CHROMIUM_PATH, DESKTOP, PHONE, TIMEOUT, randomAddress } from "./env.mjs"
import { watchPage } from "./watch.mjs"

let browser = null
// Every person opened and not yet closed. A flow that stops early leaves its people here, and the runner closes them.
const openVisitors = new Set()

const FLAGS = [
  "--no-sandbox",
  // Calls: the microphone prompt answers itself and the devices are fake.
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  // Two browsers on one machine reach each other without a name server for candidates.
  "--disable-features=WebRtcHideLocalIpsWithMdns",
]

// Runs in every page before the app's own scripts. It keeps a list of the live event streams and of the peer
// connections the page opens, so a check can ask whether the stream is open (the server will push to this page) and how
// the audio of a call is doing. It changes nothing the app sees: both are subclasses of the browser's own classes.
function trackConnections() {
  const Stream = window.EventSource
  if (Stream && !window.__rhenkoStreams) {
    window.__rhenkoStreams = []
    window.EventSource = class extends Stream {
      constructor(...args) {
        super(...args)
        window.__rhenkoStreams.push(this)
      }
    }
  }
  const Peer = window.RTCPeerConnection
  if (Peer && !window.__rhenkoPeers) {
    window.__rhenkoPeers = []
    window.RTCPeerConnection = class extends Peer {
      constructor(...args) {
        super(...args)
        window.__rhenkoPeers.push(this)
      }
    }
  }
}

export async function launchBrowser() {
  browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH || undefined,
    args: FLAGS,
  })
  return browser
}

export async function closeBrowser() {
  if (browser) await browser.close()
  browser = null
}

// A new person on a new device. `phone` gives the 390 by 844 touch layout, otherwise 1440 by 900.
// `mic` grants the microphone. The address header makes the server count this person apart from the others.
export async function newVisitor({ phone = false, mic = false, label = "page", address = randomAddress(), acceptDownloads = true } = {}) {
  if (!browser) throw new Error("the browser is not launched yet")
  const size = phone ? PHONE : DESKTOP
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: phone,
    hasTouch: phone,
    deviceScaleFactor: 1,
    acceptDownloads,
    extraHTTPHeaders: { "x-forwarded-for": address, "x-real-ip": address },
    baseURL: BASE,
  })
  context.setDefaultTimeout(TIMEOUT)
  context.setDefaultNavigationTimeout(TIMEOUT + 15_000)
  await context.addInitScript(trackConnections)
  if (mic) await context.grantPermissions(["microphone"], { origin: BASE })
  const viewport = { name: phone ? "phone 390x844" : "desktop 1440x900", width: size.width, phone }
  const page = await context.newPage()
  watchPage(page, label, viewport)
  const visitor = { context, page, phone, viewport, label, address }
  openVisitors.add(visitor)
  return visitor
}

// Another page in the same context (same cookies), for a second tab.
export async function newTab(visitor, label = "tab") {
  const page = await visitor.context.newPage()
  watchPage(page, label, visitor.viewport)
  return page
}

export async function closeVisitor(visitor) {
  openVisitors.delete(visitor)
  try {
    await visitor.context.close()
  } catch {
    // Already closed.
  }
}

export async function closeAllVisitors() {
  for (const visitor of [...openVisitors]) await closeVisitor(visitor)
}
