import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import { AuthProvider } from "@/components/AuthProvider";
import VerifyEmailGate from "@/components/VerifyEmailGate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diamond Drive — AI Baseball Coach",
  description:
    "Pro-level baseball coaching on any phone — for every kid, not just the ones who can afford it.",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png", // iOS home-screen icon
  },
  appleWebApp: {
    capable: true, // full-screen when launched from the iOS home screen
    title: "Diamond Drive",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Look switches — one word each to undo (see globals.css):
      //   data-layout: "narrow" = phone-width everywhere · "wide" = laptop two-column layouts
      //   data-text:   "large" = bigger text off the landing · "normal" = original sizes
      //   signed-out start screen: src/lib/startScreen.ts ("signin" or "landing")
      data-layout="narrow"
      data-text="large"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <VerifyEmailGate>{children}</VerifyEmailGate>
          <Nav />
        </AuthProvider>
      </body>
    </html>
  );
}
