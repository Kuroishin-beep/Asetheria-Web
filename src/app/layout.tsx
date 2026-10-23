import type { Metadata, Viewport } from "next";
import { Cinzel, EB_Garamond, Figtree, Silkscreen } from "next/font/google";
import { MotionProvider } from "@/components/motion/motion-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/app-toaster";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-cinzel",
  display: "swap",
});

const garamond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  display: "swap",
});

// Interface text. Notion-calm, rounder than a grotesk.
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

// Small chrome labels only (the Nintendo-era pixel legends).
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-silkscreen",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Continent of Asetheria",
    template: "%s · Asetheria",
  },
  description: "A living codex for the world of Asetheria.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2ead6" },
    { media: "(prefers-color-scheme: dark)", color: "#13151d" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * next-themes trusts whatever is stored under its key. A corrupted value would
 * stamp an unknown data-theme on <html>, which matches neither palette, so this
 * runs first and discards anything that is not a real theme name.
 */
const sanitizeThemeScript = `
(function(){
  try {
    var t = localStorage.getItem('asetheria-theme');
    if (t !== null && t !== 'light' && t !== 'dark') localStorage.removeItem('asetheria-theme');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cinzel.variable} ${garamond.variable} ${figtree.variable} ${silkscreen.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: sanitizeThemeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <MotionProvider>{children}</MotionProvider>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
