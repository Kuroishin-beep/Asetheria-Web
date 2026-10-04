import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/entry-card";
import { Button } from "@/components/ui/button";

/**
 * Shown for any missing or hidden page inside the codex. A page the viewer is
 * not allowed to see looks exactly like one that does not exist, on purpose.
 */
export default function CodexNotFound() {
  return (
    <div className="py-8">
      <EmptyState
        Icon={Compass}
        title="This page is not in the codex"
        hint="It may have moved, been archived, or not been revealed to you yet."
        action={
          <Button asChild>
            <Link href="/">Back to the front page</Link>
          </Button>
        }
      />
    </div>
  );
}
