import { Archivo, EB_Garamond } from "next/font/google";

/**
 * The landing page's two faces, loaded only where the landing is rendered:
 * a wide, heavy grotesk for the cinematic title (Archivo on its width axis),
 * and Garamond's italic for the single accent word, the old-world voice.
 */
export const landingDisplay = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-landing-display",
  display: "swap",
});

export const landingSerif = EB_Garamond({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["500"],
  variable: "--font-landing-serif",
  display: "swap",
});
