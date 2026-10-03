import type { Metadata, Viewport } from "next";
import { Cinzel, EB_Garamond, Inter } from "next/font/google";
import { MotionProvider } from "@/components/motion/motion-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const garamond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    { media: "(prefers-color-scheme: light)", color: "#faf6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0908" },
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
      className={`${cinzel.variable} ${garamond.variable} ${inter.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: sanitizeThemeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <MotionProvider>{children}</MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
