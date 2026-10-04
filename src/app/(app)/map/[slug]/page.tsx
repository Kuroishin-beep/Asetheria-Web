import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Map as MapIcon } from "lucide-react";
import { MapViewer } from "@/components/map-viewer";
import { PageHeading } from "@/components/entry-card";
import { getCurrentUser } from "@/lib/auth";
import { getMapBySlug, getPinsForMap } from "@/lib/maps";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const map = await getMapBySlug((await params).slug);
  return { title: map?.name ?? "Map" };
}

export default async function MapPage({ params }: { params: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const map = await getMapBySlug((await params).slug);
  if (!map) notFound();

  // Scoped in the query: a pin the viewer may not see is not in this page, its
  // data payload, or the pins API at all.
  const pins = await getPinsForMap(user, map.id);

  return (
    <div className="max-w-6xl">
      <PageHeading Icon={MapIcon} title={map.name} blurb="Pan, zoom and open a pin to see what is there." />
      <MapViewer
        slug={map.slug}
        name={map.name}
        imagePath={map.imagePath}
        width={map.width}
        height={map.height}
        pins={pins}
        isDM={user.role === "dm"}
      />
    </div>
  );
}
