import { SkeletonBar } from "@/components/skeleton";

/**
 * Skeleton for a cold /login navigation, shaped like the real form
 * (title, two fields, one button) so nothing jumps when the real content
 * arrives. No spinner — a static, low-motion placeholder instead.
 */
export default function LoginLoading() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
      aria-busy="true"
      aria-label="Loading sign-in"
    >
      <div style={{ width: "min(24rem, 100%)" }}>
        <div
          style={{
            display: "grid",
            justifyItems: "center",
            gap: "0.75rem",
            marginBottom: "1.75rem",
          }}
        >
          <SkeletonBar width="2rem" height="2rem" />
          <SkeletonBar width="14rem" height="1.5rem" />
          <SkeletonBar width="10rem" height="1rem" />
        </div>

        <div className="card" style={{ padding: "1.5rem", display: "grid", gap: "1rem" }}>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <SkeletonBar width="3rem" height="0.7rem" />
            <SkeletonBar width="100%" height="2.5rem" />
          </div>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <SkeletonBar width="4.5rem" height="0.7rem" />
            <SkeletonBar width="100%" height="2.5rem" />
          </div>
          <SkeletonBar width="100%" height="2.5rem" />
        </div>
      </div>
    </main>
  );
}
