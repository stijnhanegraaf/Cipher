/**
 * Root layout — sets metadata, viewport, Inter font, and AppShell.
 */
import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cipher — Visual Knowledge Interface",
  description: "AI-native frontend over a canonical markdown brain",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var v = localStorage.getItem('brain-theme');
                  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var resolved = v === 'light' ? 'light' : v === 'dark' ? 'dark' : (dark ? 'dark' : 'light');
                  if (resolved === 'light') document.documentElement.classList.add('light');
                  document.documentElement.setAttribute('data-theme', resolved);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="font-sans antialiased min-h-dvh"
        style={{ backgroundColor: 'var(--bg-marketing)', color: 'var(--text-primary)' }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
