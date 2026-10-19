// The opening on the landing page: a count to 100, then the panel lifts off the page. It is shown once per browsing session.
// The layout's head script decides whether a visit gets it, before the first paint, so the page underneath never shows first.
// Shared by that script (server) and the overlay (client), so this file holds no client-only code.

export const OPENING_SEEN_KEY = "rhenko-opening-seen"
export const OPENING_ATTR = "data-opening"

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

// Runs in the page head, before the first paint. A first visit gets the attribute, which shows the opening straight away.
// A click or key press skips it from that point on, even before the overlay has hydrated, and records the visit. Storage
// can be blocked: then the opening shows, as it would for any visit with nothing remembered. Reduced motion skips it.
export const OPENING_SCRIPT = `(function () {
  var root = document.documentElement;
  var key = ${JSON.stringify(OPENING_SEEN_KEY)};
  var attr = ${JSON.stringify(OPENING_ATTR)};
  var seen = false;
  try { seen = sessionStorage.getItem(key) === "1"; } catch (e) {}
  if (seen || matchMedia(${JSON.stringify(REDUCED_MOTION)}).matches) return;
  root.setAttribute(attr, "on");
  function skip() {
    root.removeAttribute(attr);
    try { sessionStorage.setItem(key, "1"); } catch (e) {}
    window.removeEventListener("pointerdown", skip);
    window.removeEventListener("keydown", skip);
  }
  window.addEventListener("pointerdown", skip);
  window.addEventListener("keydown", skip);
})();`
