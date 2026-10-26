import type { MetadataRoute } from "next"

// The public pages only. Profiles and posts are not listed: whether people's posts are indexed is their choice and the app's
// privacy setting, so the sitemap does not push them into search. Without RHENKO_PUBLIC_URL there are no absolute addresses
// to list, so the sitemap is empty rather than wrong.
const PUBLIC_PATHS = ["/", "/signup", "/rules", "/safety", "/transparency", "/privacy", "/terms", "/legal", "/advertise", "/copyright"]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.RHENKO_PUBLIC_URL ?? "").trim().replace(/\/+$/, "")
  if (!base) return []
  const lastModified = new Date()
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }))
}
