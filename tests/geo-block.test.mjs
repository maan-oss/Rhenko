// Unit checks for the country block in lib/geo-block.ts. Australia is blocked. The country is read only behind a proxy, so a
// visitor who reaches the server directly cannot type one in. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { BLOCKED_COUNTRIES, countryOf, isBlockedCountry, isOpenToBlocked } from "../lib/geo-block.ts"

const behindProxy = { RHENKO_TRUST_PROXY: "1" }

test("Australia is blocked, and no other country is", () => {
  assert.equal(BLOCKED_COUNTRIES.has("AU"), true)
  assert.equal(isBlockedCountry("AU"), true)
  assert.equal(isBlockedCountry("IN"), false)
  assert.equal(isBlockedCountry(null), false)
})

test("the country is not read unless the server sits behind a proxy", () => {
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "AU" }), {}), null)
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "AU" }), { RHENKO_TRUST_PROXY: "0" }), null)
})

test("behind a proxy the country comes from the header, in capitals", () => {
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "AU" }), behindProxy), "AU")
  assert.equal(countryOf(new Headers({ "cf-ipcountry": " au " }), behindProxy), "AU")
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "IN" }), behindProxy), "IN")
})

test("a header that names no country gives none", () => {
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "XX" }), behindProxy), null)
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "T1" }), behindProxy), null)
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "AUS" }), behindProxy), null)
  assert.equal(countryOf(new Headers({ "cf-ipcountry": "" }), behindProxy), null)
  assert.equal(countryOf(new Headers(), behindProxy), null)
})

test("the rules and policy pages stay open to a blocked visitor, and the app does not", () => {
  assert.equal(isOpenToBlocked("/unavailable"), true)
  assert.equal(isOpenToBlocked("/terms"), true)
  assert.equal(isOpenToBlocked("/privacy/data"), true)
  assert.equal(isOpenToBlocked("/privacyx"), false)
  assert.equal(isOpenToBlocked("/rules/conduct"), true)
  assert.equal(isOpenToBlocked("/"), false)
  assert.equal(isOpenToBlocked("/login"), false)
  assert.equal(isOpenToBlocked("/signup"), false)
  assert.equal(isOpenToBlocked("/api/ads/click/1"), false)
})
