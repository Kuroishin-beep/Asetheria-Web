import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for a cold /login navigation, shaped like the real form
 * (brand mark, title, two fields, one button) so nothing jumps when the real
 * content arrives. No spinner.
 */
export default function LoginLoading() {
  return (
    <main
      className="grid min-h-dvh place-items-center px-4 py-8"
      aria-busy="true"
      aria-label="Loading sign-in"
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 grid justify-items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>

        <Card>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
