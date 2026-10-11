// Tailwind for the webpack build (`next build --webpack`). The Turbopack build reads
// Tailwind through the rule in next.config.ts. Without this file, webpack ships the
// stylesheet with no utility classes, and the page renders unstyled.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
