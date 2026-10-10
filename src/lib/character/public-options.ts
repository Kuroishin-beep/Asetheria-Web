import type { EmpireInfo } from "@/components/character/steps";

/**
 * Everything the signed-out creator may show about the campaign. It is written
 * here, as constants, on purpose: the public page makes no database read, so it
 * cannot reveal a secret entry, a hidden god or anything else from the codex
 * to someone who is not signed in (risk R20). Signed-in players get the real,
 * access-checked entries instead.
 *
 * The one-liners are the same ones the landing page uses.
 */
export const PUBLIC_EMPIRES: EmpireInfo[] = [
  { id: "imperium-invicta", name: "Imperium Invicta", summary: "Seven hills, one law: an empire that builds its roads before it wins its wars." },
  { id: "hellenoria", name: "Hellenoria", summary: "A league of harbour cities: quarrelsome, brilliant and never far from the water." },
  { id: "acheaoria", name: "Acheaoria", summary: "The plateau empire of the King of Kings: gardens, fire-temples and caravans." },
];
