// Every page folder under app/ is listed in PAGE_ROUTES (lib/rules.ts). The proxy answers a path whose first segment is not listed
// with a real 404, so a new top-level route missing from the list would be refused. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PAGE_ROUTES } from "../lib/rules.ts"

const appDir = fileURLToPath(new URL("../app", import.meta.url))
const folders = (dir) =>
  readdirSync(join(appDir, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

// Folders that make no URL segment of their own: private folders (_legal), dynamic ones ([handle]), the public API and fonts.
const makesSegment = (name) => !/^[_[]/.test(name) && name !== "api" && name !== "fonts"

test("every page folder under app/ is listed in PAGE_ROUTES", () => {
  const segments = []
  for (const name of folders(".")) {
    // A route group in parentheses adds no URL segment, so the folders inside it are the segments.
    if (name.startsWith("(")) segments.push(...folders(name))
    else segments.push(name)
  }
  const unlisted = segments.filter((name) => makesSegment(name) && !PAGE_ROUTES.has(name))
  assert.deepEqual(unlisted, [])
})

test("PAGE_ROUTES covers the route groups that hold the sign-in and welcome pages", () => {
  for (const name of ["login", "signup", "welcome", "unsubscribe"]) assert.ok(PAGE_ROUTES.has(name), name)
})
