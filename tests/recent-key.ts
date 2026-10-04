/** The localStorage key the app uses for one user's recently-viewed trail (see src/lib/recent-views.ts). */
export function readRecentKeyForTest(userId: string): string {
  return `asetheria:recent:${userId}`;
}
