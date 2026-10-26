import type { MetadataRoute } from "next"
import { connection } from "next/server"

// Search engines may read the public pages. Everything that needs a sign-in, and the API, stays out. The address comes from
// RHENKO_PUBLIC_URL, the same one passkeys and payments use, so the sitemap link is right on the real domain. connection()
// reads it at request time: without it, the build would bake in whatever the build machine had set.
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection()
  const base = (process.env.RHENKO_PUBLIC_URL ?? "").trim().replace(/\/+$/, "")
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/messages",
          "/notifications",
          "/settings",
          "/drafts",
          "/bookmarks",
          "/lists",
          "/circles",
          "/analytics",
          "/connect",
          "/welcome",
          "/accept-terms",
        ],
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  }
}
