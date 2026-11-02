// The product's motion tokens. Every animated surface takes its timing from here, so the whole app moves to one rhythm.
// Durations are in seconds for the CSS-style transitions and in the motion library's own units for springs.

// One easing curve for things that enter or settle. It starts quickly and ends softly, with no overshoot.
export const EASE_OUT = [0.2, 0.7, 0.2, 1] as const

// How long a single change takes, by kind of interaction.
export const DURATION = {
  press: 0.12, // the moment a control gives under the finger
  hover: 0.18, // a pointer arriving on a control
  popover: 0.24, // menus and small overlays
  small: 0.3, // a small component changing state
  sheet: 0.4, // a sheet or panel arriving from an edge
  view: 0.45, // a whole view changing
} as const

// A selection surface that slides from one choice to the next. It is quick and well damped, so it arrives without bounce.
export const SPRING_SELECT = { type: "spring", stiffness: 520, damping: 42 } as const

// A sheet rising from the bottom edge, as Parley's sheets do: about 0.38 s to look settled, with no give, so nothing under it wobbles.
export const SPRING_SHEET = { type: "spring", visualDuration: 0.38, bounce: 0 } as const
// A sheet going away: quicker, and keeps the speed of the flick or push that sent it.
export const SHEET_SETTLE = { type: "spring", visualDuration: 0.3, bounce: 0 } as const

// Messages, from Parley. A bubble arriving rises and lands with a little give.
export const SPRING_BUBBLE = { type: "spring", visualDuration: 0.34, bounce: 0.14 } as const
// A message going out: short, and it lands softly.
export const SEND_RISE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const
// Small things that pop: a reaction arriving, a count changing.
export const SPRING_POP = { type: "spring", visualDuration: 0.26, bounce: 0.3 } as const
