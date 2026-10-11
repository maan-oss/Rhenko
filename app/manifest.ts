import type { MetadataRoute } from "next"

// The icons are built from public/icon.svg by scripts/generate-icons.mjs.
// Colours are the light theme's page colour, so the splash screen and the title bar match the first screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Rhenko",
    short_name: "Rhenko",
    description: "Posts, people and conversations, in one quiet place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f1e8",
    theme_color: "#f5f1e8",
    categories: ["social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  }
}
