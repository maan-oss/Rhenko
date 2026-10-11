// Timing and size limits for calls, shared by the server and the browser.

// A group call holds at most this many people. Every device keeps one connection to each other person, so each
// person added costs everyone in the call another connection.
export const GROUP_CALL_MAX = 6

// A call in progress checks in this often. One that misses check-ins for CALL_STALE_MS has ended.
export const CALL_HEARTBEAT_MS = 10_000
export const CALL_STALE_MS = 40_000

// The first connection gets this long to come up.
export const CALL_CONNECT_MS = 25_000

// A connection that drops waits this long for the network to settle before it looks for a new route, and gets
// CALL_RECONNECT_MS in all to come back.
export const CALL_RESTART_WAIT_MS = 5_000
export const CALL_RECONNECT_MS = 30_000

// How long a browser gathers its network routes before it sends them in one description. Routes found later follow
// one by one.
export const ICE_GATHER_MS = 2_000
