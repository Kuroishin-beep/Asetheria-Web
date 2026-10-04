import { permanentRedirect } from "next/navigation";

/**
 * Random tables are codex entries now (kind "table"), so they live at
 * /codex/tables with search, links, access control and history like every
 * other page. Old bookmarks and shortcuts land there.
 */
export default function LegacyTablesPage() {
  permanentRedirect("/codex/tables");
}
