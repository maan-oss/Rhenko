// Marks a conversation read for this viewer. Sent as a keepalive request, so it still goes through when the person leaves at once.
export function markThreadRead(conversationId: string) {
  void fetch(`/api/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined)
}
