import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionPreference } from "@/components/app/motion-preference";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rhenko",
  description: "Public conversation, built for slow networks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <MotionPreference>
            <TooltipProvider>{children}</TooltipProvider>
          </MotionPreference>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
