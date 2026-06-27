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
  // SSR/no-JS fallback only. The inline bootstrap in <head> removes these
  // and asserts ONE <meta name="theme-color"> matching the RESOLVED
  // 'brain-theme' override (manual light/dark), not just prefers-color-scheme.
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
                  // 'system' (or null/absent) falls through to the OS branch — "system" is the OS-follow value.
                  var resolved = v === 'light' ? 'light' : v === 'dark' ? 'dark' : (dark ? 'dark' : 'light');
                  if (resolved === 'light') document.documentElement.classList.add('light');
                  document.documentElement.setAttribute('data-theme', resolved);

                  // theme-color must track the RESOLVED theme, not just OS.
                  // Remove Next's media-keyed metas and assert one resolved meta.
                  var COLORS = { light: '#f7f8f8', dark: '#08090a' };
                  document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){ m.remove(); });
                  var meta = document.createElement('meta');
                  meta.setAttribute('name', 'theme-color');
                  meta.setAttribute('content', COLORS[resolved]);
                  document.head.appendChild(meta);
                  // Expose for the in-app theme toggle to update live (see AppShell).
                  window.__setThemeColor = function(next){
                    meta.setAttribute('content', COLORS[next] || COLORS.dark);
                  };
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
