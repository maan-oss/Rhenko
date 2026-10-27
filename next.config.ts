import type { NextConfig } from "next";

// Headers sent with every response. Calls need the microphone and, for video calls, the camera. A chat can share where the person
// is, when they pick Location, so geolocation is allowed for this origin only. Everything else stays off.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), payment=(), usb=(), microphone=(self)" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "110mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  async redirects() {
    // The setup used to be one page called About you. Its place part is now Where you are, at /welcome/location.
    return [{ source: "/welcome/about", destination: "/welcome/location", permanent: false }]
  },
}

export default nextConfig
