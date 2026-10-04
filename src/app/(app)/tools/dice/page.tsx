import type { Metadata } from "next";
import { Dices } from "lucide-react";
import { PageHeading } from "@/components/entry-card";
import { DiceRoller } from "./dice-roller";

export const metadata: Metadata = { title: "Dice" };

export default function DicePage() {
  return (
    <div className="max-w-3xl">
      <PageHeading
        Icon={Dices}
        title="Dice"
        blurb="Full notation, cryptographically random, and it keeps a log of the session."
      />
      <DiceRoller />
    </div>
  );
}
