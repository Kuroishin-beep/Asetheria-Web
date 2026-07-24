import type { Metadata } from "next";
import { PageHeading } from "@/components/entry-card";
import { DiceRoller } from "./dice-roller";

export const metadata: Metadata = { title: "Dice" };

export default function DicePage() {
  return (
    <div style={{ maxWidth: "46rem" }}>
      <PageHeading
        icon="🎲"
        title="Dice"
        blurb="Full notation, cryptographically random, and it keeps a log of the session."
      />
      <DiceRoller />
    </div>
  );
}
