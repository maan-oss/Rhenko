import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionRoot } from "@/components/app/motion-root";
import { Toaster } from "@/components/ui/sonner";
import { OPENING_SCRIPT } from "@/lib/opening";

// Sora is served from the app (SIL Open Font License, see app/fonts/OFL.txt). Visitors' browsers make no request to Google,
// and the build does not depend on Google being reachable. The file is the Latin subset, which is what the Google version
// served for this text.
const sora = localFont({
  src: "./fonts/sora-latin.woff2",
  variable: "--font-sora",
  weight: "400 600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rhenko",
  description: "Public conversation, built for slow networks.",
  // Every page is behind sign-in, so nothing is meant for search engines. A not-found page (for a missing, private or
  // blocked address) still answers 200 and cannot carry its own status, so it is kept out of search results this way.
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before the first paint, so a first visit's opening is on screen from the start (see lib/opening.ts). */}
        <script dangerouslySetInnerHTML={{ __html: OPENING_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <MotionRoot>{children}</MotionRoot>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
