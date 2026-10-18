import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import Nav, { FieldTopBar } from "@/components/Nav";
import PlayerNamePublisher from "@/components/PlayerNamePublisher";
import SkinSwitch from "@/components/SkinSwitch";
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

// Field skin type (only used when data-skin="field" is on — see switches.ts)
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const barlowCond = Barlow_Condensed({
  variable: "--font-barlow-cond",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
      //   more switches: src/lib/switches.ts (start screen, player Home, Report/Block)
      data-layout="narrow"
      data-text="large"
      //   data-skin:   set at runtime by <SkinSwitch> for roles in FIELD_SKIN_ROLES (switches.ts)
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${barlowCond.variable} dark h-full antialiased`}
    >
      <head>
        {/* Paint the remembered skin before React loads (no flash of the old look) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("dd-skin")==="field")document.documentElement.dataset.skin="field"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <SkinSwitch />
          <PlayerNamePublisher />
          <FieldTopBar />
          <VerifyEmailGate>{children}</VerifyEmailGate>
          <Nav />
        </AuthProvider>
      </body>
    </html>
  );
}
