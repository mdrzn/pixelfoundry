import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import { cn } from "@/lib/utils";
import { SessionProvider } from "@/components/providers/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PixelFoundry | Creative AI Control Hub",
    template: "%s | PixelFoundry",
  },
  description:
    "PixelFoundry lets teams generate and edit stunning visuals through curated AI models, a credit-friendly dashboard, and zero-ops setup.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background text-foreground antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t? t==='dark' : matchMedia('(prefers-color-scheme: dark)').matches; if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
