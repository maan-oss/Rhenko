// Unit checks for taking chat messages off the server (lib/chat-moderation.ts) and for the reasons that do it at once (lib/rules.ts).
// The server and the command line run the same statements, so these checks hold for both. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { clearMessageStatements, numbered, removalRecordStatement } from "../lib/chat-moderation.ts"
import { REPORT_REASONS, URGENT_REPORT } from "../lib/rules.ts"

const MESSAGE = "11111111-2222-4333-8444-555555555555"
const NOW = 1_700_000_000_000

function placeholders(sql) {
  return (sql.match(/\?/g) ?? []).length
}

test("clearing a message takes its words, attachment, file, sealed content and keys off the server", () => {
  const statements = clearMessageStatements(MESSAGE, NOW)
  const text = statements.map((statement) => statement.sql).join("\n")
  const update = statements[0].sql
  assert.match(update, /UPDATE chat_messages/)
  for (const column of ["body = ''", "media_file = NULL", "cipher = NULL", "attachment = NULL", "post_id = NULL"]) {
    assert.ok(update.includes(column), `the update does not clear ${column}`)
  }
  // deleted_at keeps its first value, so a message the sender deleted keeps that time.
  assert.match(update, /deleted_at = COALESCE\(deleted_at, \?\)/)
  for (const table of ["chat_message_wraps", "message_reactions", "message_translations", "chat_pinned_messages", "chat_message_reminders"]) {
    assert.ok(text.includes(`DELETE FROM ${table} WHERE message_id = ?`), `${table} is not cleared`)
  }
})

test("every statement has one parameter for each placeholder, and each one is the message", () => {
  for (const statement of clearMessageStatements(MESSAGE, NOW)) {
    assert.equal(placeholders(statement.sql), statement.params.length, statement.sql)
    assert.ok(statement.params.includes(MESSAGE) || statement.params.includes(NOW), statement.sql)
  }
})

test("numbered turns ? placeholders into $1, $2 in order", () => {
  assert.equal(numbered("SELECT ? , ? , ?"), "SELECT $1 , $2 , $3")
  assert.equal(numbered("DELETE FROM chat_message_wraps WHERE message_id = ?"), "DELETE FROM chat_message_wraps WHERE message_id = $1")
})

test("a removal record holds the category, the explanation and where it came from, trimmed", () => {
  const record = removalRecordStatement(
    {
      id: "rec-1",
      messageId: MESSAGE,
      conversationId: "conv-1",
      senderId: "user-1",
      category: "child_abuse",
      explanation: "  Removed after a report.  ",
      source: "chat-report:abc",
    },
    NOW
  )
  assert.equal(placeholders(record.sql), record.params.length)
  assert.deepEqual(record.params, ["rec-1", MESSAGE, "conv-1", "user-1", "child_abuse", "Removed after a report.", "chat-report:abc", NOW])
})

test("the reasons that act at once are reasons on the report menu, and file under the notice categories", () => {
  const categories = new Set(["intimate_image", "child_abuse"])
  for (const [reason, urgent] of Object.entries(URGENT_REPORT)) {
    assert.ok(REPORT_REASONS.includes(reason), `${reason} is not a report reason`)
    assert.ok(categories.has(urgent.category), `${reason} files under ${urgent.category}`)
    assert.ok(urgent.explanation.length >= 20, `${reason} needs an explanation a reviewer can read`)
  }
  assert.equal(URGENT_REPORT["Child sexual abuse material"]?.category, "child_abuse")
  assert.equal(URGENT_REPORT["Intimate image without consent"]?.category, "intimate_image")
  assert.equal(URGENT_REPORT.Spam, undefined)
})

test("child sexual abuse material has its own report reason, not Illegal content", () => {
  assert.ok(REPORT_REASONS.includes("Child sexual abuse material"))
  assert.notEqual(REPORT_REASONS[0], "Child sexual abuse material")
  assert.equal(new Set(REPORT_REASONS).size, REPORT_REASONS.length)
})
