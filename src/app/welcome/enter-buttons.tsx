"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Crown, Loader2, Swords } from "lucide-react";
import { FormMessage } from "@/components/shared/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EnterButtons() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") || "/";
  // Same-site paths only, so `next` can't be used as an open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");

  async function enterAsPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not open the codex.");
        setBusy(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="gap-0 overflow-hidden pt-0 text-center">
        <DoorArt src="/landing/road.webp" label="Party door" aside="Players" focus="object-[50%_65%]" />
        <form onSubmit={enterAsPlayer} className="flex h-full flex-col gap-(--card-spacing) pt-6">
          <CardHeader className="justify-items-center">
            <Swords aria-hidden="true" className="mb-2 size-7 text-gold" />
            <h2 className="font-display text-lg font-bold tracking-tight">The Party</h2>
            <CardDescription className="text-sm">
              Read everything the party has uncovered with the password your DM shared. The DM&rsquo;s
              secrets stay sealed.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto grid gap-3">
            <Label htmlFor="party-password" className="sr-only">
              Party password
            </Label>
            <Input
              id="party-password"
              type="password"
              autoComplete="current-password"
              placeholder="Party password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "door-error" : undefined}
            />
            <Button type="submit" disabled={busy || password.length === 0} className="bg-veil-accent text-veil shadow-none hover:bg-veil-ink hover:text-veil">
              {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
              {busy ? "Opening the codex…" : "Enter as a player"}
            </Button>
          </CardContent>
        </form>
      </Card>

      <Card className="gap-(--card-spacing) overflow-hidden pt-0 text-center">
        <DoorArt src="/landing/sierra.webp" label="DM door" aside="Keeper" focus="object-[70%_40%]" />
        <CardHeader className="justify-items-center pt-2">
          <Crown aria-hidden="true" className="mb-2 size-7 text-gold" />
          <h2 className="font-display text-lg font-bold tracking-tight">The Dungeon Master</h2>
          <CardDescription className="text-sm">
            The full codex: secrets, DM notes, and the pen itself. This door takes a password.
          </CardDescription>
        </CardHeader>
        <CardFooter className="mt-auto">
          <Button asChild variant="outline" className="w-full">
            <Link href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}>
              Sign in as the DM
            </Link>
          </Button>
        </CardFooter>
      </Card>

      {error && (
        <FormMessage id="door-error" className="text-center sm:col-span-2">
          {error}
        </FormMessage>
      )}
    </div>
  );
}

/**
 * A painted strip over each door, in the landing's palette: a crop of one of
 * the public-domain paintings with the door's name set over it.
 */
function DoorArt({ src, label, aside, focus }: { src: string; label: string; aside: string; focus: string }) {
  return (
    <div className="relative h-24 shrink-0 overflow-hidden bg-veil text-veil-ink">
      <Image src={src} alt="" fill sizes="(min-width: 640px) 25vw, 100vw" className={`object-cover opacity-80 ${focus}`} />
      <div className="absolute inset-0 bg-linear-to-t from-veil/90 via-veil/30 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-4 py-2 text-xs font-semibold tracking-[0.18em] uppercase">
        <span>{label}</span>
        <span className="text-veil-ink/75">{aside}</span>
      </div>
    </div>
  );
}
