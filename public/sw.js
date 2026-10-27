// Rhenko service worker. It keeps the app shell and the offline page available.
// Pages, API responses and uploads always come from the network when possible.
// Change the cache name whenever the offline page changes, so installed copies fetch the new one.
const CACHE = "rhenko-shell-v2"
const SHELL = ["/offline", "/icon.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")))
    return
  }

  if (url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      })
    )
  }
})

// Web Push. The server sends who did what, and the page to open (lib/notify-rules.ts). Browsers expect a notification for
// every push, and Safari stops delivering to a site that shows none, so even a push that can't be read shows one.
self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event.data))
})

function showPush(data) {
  let message = {}
  try {
    message = (data && data.json()) || {}
  } catch {
    message = {}
  }
  const tag = typeof message.tag === "string" && message.tag ? message.tag : undefined
  const title = typeof message.title === "string" && message.title ? message.title : "Rhenko"
  const body = typeof message.body === "string" && message.body ? message.body : "You have a new notification."
  return self.registration.showNotification(title, {
    body,
    // A later push with the same tag, such as the next message in a conversation, replaces this one.
    tag,
    renotify: Boolean(tag && message.renotify),
    icon: "/icons/icon-192.png",
    data: { url: typeof message.url === "string" ? message.url : "/notifications" },
  })
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(openFromNotification(event.notification.data))
})

// Only a page on this site is opened.
function targetOf(data) {
  const fallback = new URL("/notifications", self.location.origin)
  try {
    const url = new URL(data && typeof data.url === "string" ? data.url : "/notifications", self.location.origin)
    return url.origin === self.location.origin ? url : fallback
  } catch {
    return fallback
  }
}

// A Rhenko tab already on that page is brought forward. Otherwise an open Rhenko tab is brought forward and goes there,
// and with none open, a new one opens.
async function openFromNotification(data) {
  const target = targetOf(data)
  const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  const already = tabs.find((tab) => tab.url === target.href)
  if (already) return already.focus()
  const tab = tabs.find((each) => each.focused) || tabs.find((each) => each.visibilityState === "visible") || tabs[0]
  if (!tab) return self.clients.openWindow(target.href)
  const shown = await tab.focus().catch(() => tab)
  if (await askToOpen(shown, target)) return shown
  // The tab didn't answer, such as the sign-in page, which has no app around it. It loads the page itself.
  try {
    return await shown.navigate(target.href)
  } catch {
    return self.clients.openWindow(target.href)
  }
}

// The app moves to the page in place (components/app/sw-register.tsx), so a call in that tab keeps going. It answers on
// the channel when it has.
function askToOpen(tab, target) {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), 1000)
    channel.port1.onmessage = () => {
      clearTimeout(timer)
      resolve(true)
    }
    tab.postMessage({ type: "rhenko:open", url: target.pathname + target.search + target.hash }, [channel.port2])
  })
}
