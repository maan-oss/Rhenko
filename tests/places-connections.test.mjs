// Unit checks for lib/places.ts (where someone is) and lib/connection-rank.ts (who is suggested, and why).
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { AREA_MAX, areaKey, areaProblem, cleanArea, COUNTRIES, countryName, isCountryCode } from "../lib/places.ts"
import { factsOf, GROUP_ORDER, groupOf, rankConnections, reasonsOf, scoreOf } from "../lib/connection-rank.ts"

const NOW = Date.UTC(2026, 9, 13)
const DAY = 24 * 60 * 60 * 1000

// ---- where someone is ----------------------------------------------------------------------------------------------

test("countries are named, sorted, and only listed codes are accepted", () => {
  assert.ok(COUNTRIES.length >= 50)
  assert.equal(countryName("AU"), "Australia")
  assert.equal(isCountryCode("AU"), true)
  assert.equal(isCountryCode("ZZ"), false)
  assert.equal(countryName("ZZ"), null)
  const names = COUNTRIES.map((country) => country.name)
  assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
})

test("a city or town is accepted, and an empty area clears it", () => {
  assert.equal(areaProblem("Brisbane"), null)
  assert.equal(areaProblem("  Saint   Kilda "), null)
  assert.equal(areaProblem("St Kilda"), null)
  assert.equal(areaProblem("मुंबई"), null)
  assert.equal(areaProblem(""), null)
  assert.equal(areaProblem("   "), null)
})

test("a street address, a house number or a postcode is refused", () => {
  assert.match(areaProblem("12 Main Street") ?? "", /house numbers/)
  assert.match(areaProblem("Brisbane 4000") ?? "", /house numbers/)
  assert.match(areaProblem("Queen Street Mall") ?? "", /street address/)
  assert.match(areaProblem("Flat near the park") ?? "", /street address/)
  assert.match(areaProblem("12345") ?? "", /city or town/)
})

test("an area longer than the limit is refused", () => {
  assert.equal(areaProblem("a".repeat(AREA_MAX)), null)
  assert.match(areaProblem("a".repeat(AREA_MAX + 1)) ?? "", /Up to 40/)
})

test("areas that differ only in case, accents or punctuation share one key", () => {
  assert.equal(areaKey("Brisbane"), areaKey("  brisbane "))
  assert.equal(areaKey("Saint-Denis"), areaKey("Saint Denis"))
  assert.equal(areaKey("São Paulo"), areaKey("Sao Paulo"))
  assert.notEqual(areaKey("Perth"), areaKey("Perth Amboy"))
  assert.equal(cleanArea("  Sao   Paulo "), "Sao Paulo")
})

// ---- who is suggested, and why --------------------------------------------------------------------------------------

const names = { en: "English", es: "Spanish", hi: "Hindi", fr: "French" }
const nameOf = (code) => names[code] ?? code

function person(id, overrides = {}) {
  return {
    id,
    sameArea: false,
    speaks: [],
    learns: [],
    mutual: 0,
    mutualHandles: [],
    topics: [],
    followers: 10,
    activeAt: NOW - DAY,
    ...overrides,
  }
}

const ME = { speaks: ["en"], learns: ["es"], area: "Brisbane", topics: ["cooking"] }

test("a language swap outranks a neighbour, a shared friend or a shared language", () => {
  const swap = person("swap", { speaks: ["es"], learns: ["en"] })
  const near = person("near", { sameArea: true })
  const friend = person("friend", { mutual: 3, mutualHandles: ["ann", "bo", "cy"] })
  const shared = person("shared", { speaks: ["en"] })
  const ranked = rankConnections(ME, [shared, friend, near, swap], NOW)
  assert.equal(ranked.get("exchange")[0].candidate.id, "swap")
  assert.equal(ranked.get("nearby")[0].candidate.id, "near")
  assert.equal(ranked.get("mutual")[0].candidate.id, "friend")
  assert.equal(ranked.get("language")[0].candidate.id, "shared")
})

test("a person is listed once, under the strongest group they qualify for", () => {
  const both = person("both", { sameArea: true, mutual: 2, speaks: ["en"], topics: ["cooking"] })
  const ranked = rankConnections(ME, [both], NOW)
  const listed = GROUP_ORDER.filter((group) => ranked.get(group).length > 0)
  assert.deepEqual(listed, ["nearby"])
  assert.equal(groupOf(factsOf(ME, both)), "nearby")
})

test("nothing in common gives no group at all", () => {
  const stranger = person("stranger", { speaks: ["hi"], learns: ["hi"] })
  const ranked = rankConnections(ME, [stranger], NOW)
  for (const group of GROUP_ORDER) assert.equal(ranked.get(group).length, 0)
})

test("a switched-off signal never contributes, because the viewer's side is empty", () => {
  // Nearby suggestions off for the viewer: area null. Language suggestions off: no languages on either side.
  const off = { speaks: [], learns: [], area: null, topics: ["cooking"] }
  const near = person("near", { sameArea: true, speaks: ["en"] })
  assert.equal(groupOf(factsOf(off, near)), null)
  const swap = person("swap", { speaks: ["es"], learns: ["en"] })
  assert.equal(groupOf(factsOf(off, swap)), null)
})

test("more shared facts rank a person higher inside their group", () => {
  const one = person("one", { mutual: 1, mutualHandles: ["ann"] })
  const three = person("three", { mutual: 3, mutualHandles: ["ann", "bo", "cy"] })
  const ranked = rankConnections(ME, [one, three], NOW).get("mutual")
  assert.deepEqual(
    ranked.map((item) => item.candidate.id),
    ["three", "one"]
  )
})

test("ties break on id, so the same data always gives the same order", () => {
  const a = person("a", { mutual: 1 })
  const b = person("b", { mutual: 1 })
  const first = rankConnections(ME, [a, b], NOW).get("mutual").map((item) => item.candidate.id)
  const second = rankConnections(ME, [b, a], NOW).get("mutual").map((item) => item.candidate.id)
  assert.deepEqual(first, second)
  assert.deepEqual(first, ["a", "b"])
})

test("recent activity lifts a person a little, and an old account less", () => {
  const active = person("active", { mutual: 1, activeAt: NOW - DAY })
  const quiet = person("quiet", { mutual: 1, activeAt: NOW - 90 * DAY })
  assert.ok(scoreOf(factsOf(ME, active), active, NOW) > scoreOf(factsOf(ME, quiet), quiet, NOW))
})

test("reasons are written from the facts, most useful first, and name the languages", () => {
  const swap = person("swap", { sameArea: true, mutual: 1, mutualHandles: ["ann"], speaks: ["es"], learns: ["en"] })
  const reasons = reasonsOf(ME, swap, factsOf(ME, swap), nameOf)
  assert.equal(reasons[0], "Language swap: Spanish for English")
  assert.equal(reasons[1], "In Brisbane, like you")
  assert.equal(reasons[2], "Followed by @ann, who you follow")
})

test("a reason for a shared language, a language being learned and a topic", () => {
  const learner = person("learner", { speaks: ["hi"], learns: ["en"] })
  const reasons = reasonsOf(ME, learner, factsOf(ME, learner), nameOf)
  assert.deepEqual(reasons, ["Learning English, which you speak"])

  const topical = person("topical", { topics: ["cooking", "travel"] })
  assert.deepEqual(reasonsOf(ME, topical, factsOf(ME, topical), nameOf), ["Writes about #cooking, which you follow"])

  const teacher = person("teacher", { speaks: ["es", "fr"] })
  assert.deepEqual(reasonsOf(ME, teacher, factsOf(ME, teacher), nameOf), ["Speaks Spanish, which you are learning"])
})

test("a shared friend count reads well for one friend, several and a bare number", () => {
  const one = person("one", { mutual: 1, mutualHandles: ["ann"] })
  const many = person("many", { mutual: 4, mutualHandles: ["ann", "bo"] })
  const bare = person("bare", { mutual: 2, mutualHandles: [] })
  assert.equal(reasonsOf(ME, many, factsOf(ME, many), nameOf)[0], "Followed by @ann and 3 more you follow")
  assert.equal(reasonsOf(ME, bare, factsOf(ME, bare), nameOf)[0], "Followed by 2 people you follow")
  assert.equal(reasonsOf(ME, one, factsOf(ME, one), nameOf)[0], "Followed by @ann, who you follow")
})

test("a language list of more than three names is shortened", () => {
  const many = person("many", { speaks: ["en", "es", "hi", "fr"] })
  const me = { speaks: ["en", "es", "hi", "fr"], learns: [], area: null, topics: [] }
  const reasons = reasonsOf(me, many, factsOf(me, many), nameOf)
  assert.equal(reasons[0], "Speaks English, Spanish and Hindi, like you")
})

test("the group list is in a fixed order, and every group has a title", () => {
  assert.deepEqual(GROUP_ORDER, ["exchange", "nearby", "mutual", "language", "interest"])
})
