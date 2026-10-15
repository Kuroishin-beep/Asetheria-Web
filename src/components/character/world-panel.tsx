"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Globe2, Home, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Place = { id: string; slug: string; name: string; summary: string };

const SEARCH_DELAY_MS = 160;

/**
 * How a character sits in the world, for its player: whether it is on the party roster, and which place it calls
 * home. Each change is saved at once and the server decides: a home must be a location page the player can read.
 */
export function CharacterWorldPanel({ id, shared, home }: { id: string; shared: boolean; home: string | null }) {
  const router = useRouter();
  const [on, setOn] = useState(shared);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchId = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) {
      setFound([]);
      return;
    }
    const n = ++searchId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/find?q=${encodeURIComponent(query)}&kind=location`);
        const data = await res.json();
        if (n === searchId.current) setFound(data.results ?? []);
      } catch {
        if (n === searchId.current) setFound([]);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  async function change(body: Record<string, unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "That change could not be saved.");
        return false;
      }
      toast.success(done);
      router.refresh();
      return true;
    } catch {
      setError("That change could not be saved. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(next: boolean) {
    setOn(next);
    if (!(await change({ shared: next }, next ? "Shared with the party" : "No longer shared"))) setOn(!next);
  }

  async function chooseHome(place: Place) {
    if (await change({ homeSlug: place.slug }, `${place.name} is now home`)) {
      setQuery("");
      setFound([]);
    }
  }

  return (
    <Card className="no-print" data-testid="world-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <Globe2 aria-hidden="true" className="size-5 text-gold" />
          In the world
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-start gap-3">
          <Switch id="share-character" checked={on} disabled={busy} onCheckedChange={toggle} />
          <div className="grid gap-1">
            <Label htmlFor="share-character">Share with the party</Label>
            <p className="text-sm text-muted-foreground">
              Other players and the DM can then see this character&apos;s name, heritage, class, level, citizenship and worship on the Party page. Your sheet, story and journal stay private.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="home-search" className="flex items-center gap-2">
            <Home aria-hidden="true" className="size-4" />
            Home
          </Label>
          {home && (
            <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="home-current">
              <span>
                Home is <strong>{home}</strong>
              </span>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => change({ homeSlug: null }, "Home cleared")}>
                <X aria-hidden="true" />
                Clear home
              </Button>
            </p>
          )}
          <div className="relative max-w-sm">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="home-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a place…" className="pl-9" autoComplete="off" />
          </div>
          {found.length > 0 && (
            <ul className="grid max-w-sm gap-1" aria-label="Matching places">
              {found.map((p) => (
                <li key={p.id}>
                  <Button type="button" variant="ghost" className="h-auto w-full justify-start py-2 text-left font-normal" disabled={busy} onClick={() => chooseHome(p)}>
                    <span className="font-medium">{p.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="world-error">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
