// Who hears about a message in a chat. Pure, so the rule can be checked without a database (tests/chat-audience.test.mjs).

// The members who hear about a message from `senderId`: every member except the sender and anyone blocked either way with the
// sender. A blocked pair get nothing of each other's messages, neither the banner nor the realtime signal.
export function audienceOf(memberIds: readonly string[], senderId: string, blocked: ReadonlySet<string>): string[] {
  return memberIds.filter((id) => id !== senderId && !blocked.has(id))
}
