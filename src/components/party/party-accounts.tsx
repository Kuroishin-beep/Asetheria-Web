"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { KeyRound, Loader2, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { FormMessage } from "@/components/shared/form-message";
import { PasswordInput } from "@/components/shared/password-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CharacterChoice, PartyAccount } from "@/lib/party-accounts";

const ENDPOINT = "/api/party/accounts";
const MIN_PASSWORD = 10;

type Action =
  | { action: "create"; username: string; password: string }
  | { action: "resetPassword"; playerId: string; password: string }
  | { action: "giveCharacter"; playerId: string; characterId: string };

/** Sends one change to the server; resolves to an error message, or null when it worked. */
async function send(body: Action): Promise<string | null> {
  try {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? "That did not work. Try again.";
  } catch {
    return "Could not reach the server. Check your connection.";
  }
}

/** The DM's panel on the Party page: a login for each player, and which characters each one plays. */
export function PartyAccounts({ accounts, choices }: { accounts: PartyAccount[]; choices: CharacterChoice[] }) {
  return (
    <section aria-labelledby="party-logins" className="mb-8 grid gap-4" data-testid="party-accounts">
      <div>
        <h2 id="party-logins" className="font-display text-xl font-bold tracking-tight">
          Player logins
        </h2>
        <p className="text-sm text-muted-foreground">
          Give each player a name and password. They sign in at the party door and land on their own characters.
        </p>
      </div>
      <ResetSummary accounts={accounts} />
      <NewPlayer />
      {accounts.length === 0 ? (
        <Card size="sm">
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <UserRound aria-hidden="true" className="size-5" />
            No player logins yet. Add the first one above.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {accounts.map((a, i) => (
            <motion.li key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <AccountCard account={a} choices={choices} />
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A banner when players are waiting on a new password, so the DM sees it without scanning every card. */
function ResetSummary({ accounts }: { accounts: PartyAccount[] }) {
  const waiting = accounts.filter((a) => a.resetRequest);
  if (waiting.length === 0) return null;
  return (
    <Card size="sm" className="border-gold/50" data-testid="reset-summary">
      <CardContent className="flex items-start gap-3 text-sm">
        <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
        <p>
          <span className="font-semibold">{waiting.map((a) => a.username).join(", ")}</span>{" "}
          {waiting.length === 1 ? "has" : "have"} asked for a new password. Set one on their card below, then tell them.
        </p>
      </CardContent>
    </Card>
  );
}

function NewPlayer() {
  const router = useRouter();
  const errorId = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await send({ action: "create", username: username.trim(), password });
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    toast.success(`${username.trim()} can now sign in at the party door`);
    setUsername("");
    setPassword("");
    router.refresh();
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus aria-hidden="true" className="size-4" />
          Add a player
        </CardTitle>
        <CardDescription>Tell them the name and password; you can see the password before you save it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="new-player-name">Name</Label>
            <Input
              id="new-player-name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              maxLength={32}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-player-password">Password</Label>
            <PasswordInput
              id="new-player-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          <Button type="submit" disabled={busy || !username.trim() || !password}>
            {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
            Add player
          </Button>
          {error && (
            <FormMessage id={errorId} className="sm:col-span-3">
              {error}
            </FormMessage>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function AccountCard({ account, choices }: { account: PartyAccount; choices: CharacterChoice[] }) {
  const others = choices.filter((c) => c.ownerId !== account.id);
  return (
    <Card size="sm" className="h-full" data-testid="party-account">
      <CardHeader>
        <CardTitle className="font-display text-lg tracking-tight">{account.username}</CardTitle>
        {account.resetRequest && (
          <div className="grid gap-1" data-testid="reset-request">
            <Badge className="w-fit">Forgot password</Badge>
            {account.resetRequest.note && <p className="text-sm text-muted-foreground">&ldquo;{account.resetRequest.note}&rdquo;</p>}
          </div>
        )}
        <CardDescription>
          {account.lastLoginAt ? `Last signed in ${new Date(account.lastLoginAt).toLocaleDateString()}` : "Has not signed in yet"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2" aria-label={`${account.username}'s characters`}>
          {account.characters.length === 0 ? (
            <span className="text-sm text-muted-foreground">No characters yet</span>
          ) : (
            account.characters.map((c) => (
              <Badge key={c.id} variant="secondary">
                {c.name}
              </Badge>
            ))
          )}
        </div>
        {others.length > 0 && <GiveCharacter playerId={account.id} username={account.username} choices={others} />}
        <ResetPassword playerId={account.id} username={account.username} />
      </CardContent>
    </Card>
  );
}

function GiveCharacter({ playerId, username, choices }: { playerId: string; username: string; choices: CharacterChoice[] }) {
  const router = useRouter();
  const selectId = useId();
  const [characterId, setCharacterId] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!characterId) return;
    setBusy(true);
    const problem = await send({ action: "giveCharacter", playerId, characterId });
    setBusy(false);
    if (problem) {
      toast.error(problem);
      return;
    }
    toast.success(`Given to ${username}`);
    setCharacterId("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-2">
        <Label htmlFor={selectId}>Give a character</Label>
        <NativeSelect id={selectId} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
          <NativeSelectOption value="">Choose…</NativeSelectOption>
          {choices.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name} (now {c.ownerName})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline" disabled={busy || !characterId}>
        {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
        Give
      </Button>
    </form>
  );
}

function ResetPassword({ playerId, username }: { playerId: string; username: string }) {
  const router = useRouter();
  const fieldId = useId();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      toast.error(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    const problem = await send({ action: "resetPassword", playerId, password });
    setBusy(false);
    if (problem) {
      toast.error(problem);
      return;
    }
    toast.success(`New password set for ${username}`);
    setPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="grid min-w-48 flex-1 gap-2">
        <Label htmlFor={fieldId}>New password</Label>
        <PasswordInput id={fieldId} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </div>
      <Button type="submit" variant="outline" disabled={busy || !password}>
        {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <KeyRound aria-hidden="true" />}
        Set password
      </Button>
    </form>
  );
}
