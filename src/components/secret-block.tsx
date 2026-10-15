import { EyeOff, Sparkles } from "lucide-react";
import { SecretRevealControl, type PlayerChoice } from "@/components/secret-reveal-control";

/**
 * One secret passage inside a page. The DM sees it with a control for who it is revealed to; a player
 * sees it only if it was revealed to them, so nothing about a hidden block reaches their page at all.
 */
export function SecretBlockCard({
  id,
  html,
  forDm,
  revealedTo,
  players,
}: {
  id: string;
  html: string;
  forDm: boolean;
  revealedTo: { id: string; name: string }[];
  players: PlayerChoice[];
}) {
  return (
    <aside
      aria-label={forDm ? "Secret passage, visible only to you and the players you reveal it to" : "A passage the DM revealed to you"}
      data-secret-block={id}
      className={
        forDm
          ? "my-5 rounded-xl border border-dashed border-secret/50 bg-secret/5 p-4"
          : "my-5 rounded-xl border border-gold/40 bg-gold/5 p-4"
      }
    >
      <div className="no-print mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.07em] ${forDm ? "text-secret" : "text-gold"}`}>
          {forDm ? <EyeOff aria-hidden="true" className="size-4" /> : <Sparkles aria-hidden="true" className="size-4" />}
          {forDm ? "Secret, hidden from players" : "Revealed to you"}
        </h3>
        {forDm && <SecretRevealControl secretId={id} players={players} initial={revealedTo} />}
      </div>
      <div className="prose-codex" dangerouslySetInnerHTML={{ __html: html }} />
    </aside>
  );
}
