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

// A sheet rising from the bottom edge. Heavier than the selection, and damped enough to settle without overshoot.
export const SPRING_SHEET = { type: "spring", stiffness: 420, damping: 42, mass: 0.9 } as const
