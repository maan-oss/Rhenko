// Unit checks for cashtags ($AAPL, $btc) in lib/rules.ts and lib/social-rules.ts: which $ marks count, how they are
// normalised, that hashtags read exactly as before, and the topic keys that keep $AAPL apart from #AAPL.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  extractCashtags,
  extractHashtags,
  extractMentions,
  extractTopics,
  normalizeTag,
  topicLabel,
  topicNeedle,
} from "../lib/rules.ts"
import { checkTopic, topicFromParam } from "../lib/social-rules.ts"

test("a $ and one to ten letters is a cashtag", () => {
  assert.deepEqual(extractCashtags("$AAPL"), ["$AAPL"])
  assert.deepEqual(extractCashtags("Bought $TSLA today"), ["$TSLA"])
  assert.deepEqual(extractCashtags("$A is one letter"), ["$A"])
  assert.deepEqual(extractCashtags("ten letters: $ABCDEFGHIJ"), ["$ABCDEFGHIJ"])
  assert.deepEqual(extractCashtags("line one\n$MSFT on line two"), ["$MSFT"])
})

test("a cashtag may follow punctuation and end before punctuation", () => {
  assert.deepEqual(extractCashtags("(see $NVDA)"), ["$NVDA"])
  assert.deepEqual(extractCashtags("Up on $AAPL."), ["$AAPL"])
  assert.deepEqual(extractCashtags("$AAPL, $MSFT; $GOOG!"), ["$AAPL", "$MSFT", "$GOOG"])
  assert.deepEqual(extractCashtags("pair $BTC/$ETH"), ["$BTC", "$ETH"])
  assert.deepEqual(extractCashtags("\"$AMZN\" and '$META'"), ["$AMZN", "$META"])
})

test("$5 and $100 are prices, not cashtags", () => {
  assert.deepEqual(extractCashtags("It costs $5"), [])
  assert.deepEqual(extractCashtags("Pay $100 now"), [])
  assert.deepEqual(extractCashtags("$5M raised, $100K more, $0.99 each"), [])
  assert.deepEqual(extractCashtags("$5AAPL"), [])
  assert.deepEqual(extractCashtags("$ AAPL and a lone $"), [])
})

test("a $ inside a word is not a cashtag", () => {
  assert.deepEqual(extractCashtags("US$AAPL"), [])
  assert.deepEqual(extractCashtags("abc$AAPL"), [])
  assert.deepEqual(extractCashtags("item2$AAPL"), [])
  assert.deepEqual(extractCashtags("snake_$AAPL"), [])
  assert.deepEqual(extractCashtags("$$AAPL"), [])
  assert.deepEqual(extractCashtags("#$AAPL"), [])
  assert.deepEqual(extractCashtags("@$AAPL"), [])
})

test("the letters must end the word: no digits or eleventh letter after them, and nothing is cut short", () => {
  assert.deepEqual(extractCashtags("$AAPL2025"), [])
  assert.deepEqual(extractCashtags("$AAPL_x"), [])
  assert.deepEqual(extractCashtags("$ABCDEFGHIJK"), [])
  assert.deepEqual(extractCashtags("$CAFÉ"), [])
})

test("a link is skipped whole", () => {
  assert.deepEqual(extractCashtags("https://example.com/quote/$AAPL?x=1"), [])
  assert.deepEqual(extractCashtags("https://example.com/$AAPL and then $MSFT"), ["$MSFT"])
})

test("cashtags go to upper case and count once", () => {
  assert.deepEqual(extractCashtags("$aapl"), ["$AAPL"])
  assert.deepEqual(extractCashtags("$Aapl $AAPL $aapl"), ["$AAPL"])
  assert.deepEqual(extractCashtags("$btc then $Eth"), ["$BTC", "$ETH"])
  assert.equal(normalizeTag("$aapl"), "$AAPL")
  assert.equal(normalizeTag("$AaPl"), "$AAPL")
})

test("mixed text: cashtags, hashtags and mentions are each read on their own", () => {
  const body = "Long $aapl, short $TSLA. Notes from @maan_x on #Earnings and #stocks2026, plus $5 and US$IBM."
  assert.deepEqual(extractCashtags(body), ["$AAPL", "$TSLA"])
  assert.deepEqual(extractHashtags(body), ["earnings", "stocks2026"])
  assert.deepEqual(extractMentions(body), ["maan_x"])
  assert.deepEqual(extractTopics(body), ["earnings", "stocks2026", "$AAPL", "$TSLA"])
})

test("hashtags read as they did before cashtags", () => {
  assert.deepEqual(extractHashtags("#Hello #world_1 #café"), ["hello", "world_1", "café"])
  assert.deepEqual(extractHashtags("item#2 and a#b and mail@x.com#y"), [])
  assert.deepEqual(extractHashtags("https://example.com/#top is a link"), [])
  assert.deepEqual(extractHashtags("#a #A #a"), ["a"])
  assert.deepEqual(extractHashtags(`#${"x".repeat(50)}`), ["x".repeat(50)])
  assert.deepEqual(extractHashtags(`#${"x".repeat(51)}`), [])
  // A $ is not part of a hashtag, and a hashtag does not make a cashtag.
  assert.deepEqual(extractHashtags("$AAPL"), [])
  assert.deepEqual(extractCashtags("#AAPL"), [])
  assert.deepEqual(extractHashtags("#AAPL $AAPL"), ["aapl"])
  assert.deepEqual(extractHashtags("#tag$AAPL"), ["tag"])
  assert.equal(normalizeTag("#AAPL"), "aapl")
  assert.equal(normalizeTag("AAPL"), "aapl")
  assert.equal(normalizeTag("#Summer"), "summer")
})

test("$AAPL and #AAPL are two topics with two keys", () => {
  assert.deepEqual(extractTopics("#AAPL"), ["aapl"])
  assert.deepEqual(extractTopics("$AAPL"), ["$AAPL"])
  assert.deepEqual(extractTopics("#AAPL $AAPL"), ["aapl", "$AAPL"])
  assert.notEqual(normalizeTag("$AAPL"), normalizeTag("#AAPL"))
  assert.equal(topicLabel("aapl"), "#aapl")
  assert.equal(topicLabel("$AAPL"), "$AAPL")
  assert.equal(topicNeedle("aapl"), "#aapl")
  assert.equal(topicNeedle("$AAPL"), "$aapl")
  // The text a post must hold for one topic never holds the other: "#aapl" has no $, and "$aapl" has no #.
  assert.ok(!"#aapl".includes(topicNeedle("$AAPL")))
  assert.ok(!"$aapl".includes(topicNeedle("aapl")))
})

test("a followed or linked topic is checked the same way", () => {
  assert.deepEqual(checkTopic("$aapl"), { ok: true, tag: "$AAPL" })
  assert.deepEqual(checkTopic("  $Btc "), { ok: true, tag: "$BTC" })
  assert.deepEqual(checkTopic("AAPL"), { ok: true, tag: "aapl" })
  assert.deepEqual(checkTopic("#AAPL"), { ok: true, tag: "aapl" })
  assert.equal(checkTopic("$5").ok, false)
  assert.equal(checkTopic("$").ok, false)
  assert.equal(checkTopic("$AAPL2").ok, false)
  assert.equal(checkTopic("$ABCDEFGHIJK").ok, false)
  assert.equal(checkTopic("#$AAPL").ok, false)
  assert.equal(checkTopic("a$b").ok, false)
})

test("a topic link carries the $ either way it arrives", () => {
  assert.deepEqual(topicFromParam("%24AAPL"), { ok: true, tag: "$AAPL" })
  assert.deepEqual(topicFromParam("%24aapl"), { ok: true, tag: "$AAPL" })
  assert.deepEqual(topicFromParam("$AAPL"), { ok: true, tag: "$AAPL" })
  assert.deepEqual(topicFromParam("aapl"), { ok: true, tag: "aapl" })
  assert.equal(topicFromParam("%245").ok, false)
  assert.equal(topicFromParam("%E0%A4%A").ok, false)
  // The address the post text links to round-trips to the same topic.
  assert.equal(`/topics/${encodeURIComponent("$AAPL")}`, "/topics/%24AAPL")
  assert.deepEqual(topicFromParam(encodeURIComponent("$AAPL")), { ok: true, tag: "$AAPL" })
})
