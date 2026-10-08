import {
  Archive,
  BookOpen,
  Building2,
  Cog,
  Columns3,
  Crown,
  DatabaseBackup,
  Dices,
  FlaskConical,
  Home,
  KeyRound,
  LayoutGrid,
  Leaf,
  type LucideIcon,
  MapPin,
  NotebookPen,
  Mountain,
  Network,
  PawPrint,
  Pickaxe,
  Scale,
  ScrollText,
  Shield,
  ShieldCheck,
  Skull,
  Sparkles,
  Star,
  StickyNote,
  Sun,
  Swords,
  Tent,
  User,
  Users,
  Map as MapIcon,
} from "lucide-react";
import type { EntryKind } from "@/db/schema";

/**
 * One lucide icon per kind. `KindDef.icon` (an emoji) is still used where plain
 * text is required, such as a graph node's accessible name; everything drawn
 * as an icon in the UI uses these so the set reads as one family.
 */
export const KIND_ICONS: Record<EntryKind, LucideIcon> = {
  empire: Crown,
  lore: ScrollText,
  location: MapPin,
  deity: Sun,
  pantheon: Columns3,
  organization: Users,
  faction: Swords,
  npc: User,
  family: Shield,
  creature: Skull,
  item: FlaskConical,
  ore: Pickaxe,
  flora: Leaf,
  fauna: PawPrint,
  quest: KeyRound,
  session: BookOpen,
  rule: Scale,
  system: Cog,
  table: Dices,
  note: StickyNote,
};

/** Location tiers are separate sections (see `LOCATION_TIERS`), each with its own icon. */
const TIER_ICONS: Record<string, LucideIcon> = {
  capitals: Star,
  cities: Building2,
  towns: Home,
  villages: Tent,
  districts: LayoutGrid,
  sites: MapPin,
  wilds: Mountain,
};

export function iconForSection(slug: string, kind?: EntryKind): LucideIcon {
  return TIER_ICONS[slug] ?? (kind ? KIND_ICONS[kind] : undefined) ?? Sparkles;
}

export const TOOL_ICONS = {
  map: MapIcon,
  graph: Network,
  dice: Dices,
} as const;

export const KEEPER_ICONS = {
  archive: Archive,
  backup: DatabaseBackup,
  access: ShieldCheck,
  planner: NotebookPen,
} as const;
