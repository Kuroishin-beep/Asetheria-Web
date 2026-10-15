import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import { MapViewer } from "@/components/map-viewer";
import { PageHeading } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getLayersForMap, getMapBySlug, getPinsForMap, getRegionsForMap, mapChoices, parentMapOf } from "@/lib/maps";

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
  const isDM = user.role === "dm";

  // Scoped in the query: a pin or region the viewer may not see is not in this page, its
  // data payload, or the API at all, and neither is a layer that holds only such things.
  const [pins, regions, parent, choices] = await Promise.all([getPinsForMap(user, map.id), getRegionsForMap(user, map.id), parentMapOf(map.id), isDM ? mapChoices(map.id) : Promise.resolve([])]);
  const layers = await getLayersForMap(user, map.id, { pins, regions });

  return (
    <div className="max-w-6xl">
      <PageHeading
        Icon={MapIcon}
        title={map.name}
        blurb="Pan, zoom and open a pin or a region to see what is there."
        action={
          parent ? (
            <Button asChild variant="outline">
              <Link href={`/map/${parent.slug}`} data-testid="back-to-parent-map">
                <ArrowLeft aria-hidden="true" />
                Back to {parent.name}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <MapViewer
        slug={map.slug}
        name={map.name}
        imagePath={map.imagePath}
        width={map.width}
        height={map.height}
        pins={pins}
        regions={regions}
        layers={layers}
        mapChoices={choices}
        isDM={isDM}
      />
    </div>
  );
}
