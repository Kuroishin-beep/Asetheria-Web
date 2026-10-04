import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Map as MapIcon } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { getCurrentUser } from "@/lib/auth";
import { listMaps } from "@/lib/maps";

export const metadata: Metadata = { title: "Map" };

/** The maps index: with one map it goes straight to it. */
export default async function MapsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const maps = await listMaps();
  if (maps.length > 0) redirect(`/map/${maps[0].slug}`);

  return (
    <>
      <PageHeading Icon={MapIcon} title="Map" blurb="Where everything is." />
      <EmptyState
        Icon={MapIcon}
        title="No map yet"
        hint={
          user.role === "dm"
            ? "Add a map image under public/maps and run npm run maps:seed to register it."
            : "The DM has not shared a map yet."
        }
      />
    </>
  );
}
