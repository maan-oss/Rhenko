// The order of the Home tabs, as plain functions with no database in them, so the rules can be checked on their own.
// A list and a topic can share one order: a list is named by its id, a topic by its tag.

export type TabRef = { kind: "list"; id: string } | { kind: "topic"; tag: string }

// A list and a topic can have the same name, so the kind is part of the key.
export function tabKey(tab: TabRef): string {
  return tab.kind === "list" ? `list:${tab.id}` : `topic:${tab.tag}`
}

// The order with one tab moved a place up (-1) or down (1). Null when it is already at that end, or is not in the order.
export function movedOrder(order: TabRef[], target: TabRef, direction: -1 | 1): TabRef[] | null {
  const from = order.findIndex((tab) => tabKey(tab) === tabKey(target))
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return null
  const next = [...order]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

// Puts the shown tabs back into the slots they had, in their new order. A tab that is hidden for now (its owner blocked
// the viewer, or its topic is snoozed) keeps its slot, so moving a tab never shuffles a hidden one.
export function reslot(all: TabRef[], shownNow: TabRef[], shownOrder: TabRef[]): TabRef[] {
  const shown = new Set(shownNow.map(tabKey))
  const queue = [...shownOrder]
  return all.map((tab) => (shown.has(tabKey(tab)) ? queue.shift()! : tab))
}
