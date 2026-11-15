import { EB_Garamond } from "next/font/google";

/**
 * The landing page's prose face, loaded only where the landing is rendered:
 * Garamond's italic for the accent word and the story text, the old-world
 * voice. Titles use the app's display face (Cinzel, `font-display`).
 */
export const landingSerif = EB_Garamond({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["500"],
  variable: "--font-landing-serif",
  display: "swap",
});
