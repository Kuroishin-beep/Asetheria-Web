import type { GraphEdge, GraphNode, GraphPoint } from "@/lib/graph-layout";

/**
 * A small least-recently-used cache for graph layouts, keyed by a fingerprint
 * of exactly what is laid out. Pure and framework-free so it can be tested
 * directly; `graph-cache.ts` holds the one instance the server uses.
 *
 * The key is the content, so there is nothing to invalidate: change a page or a
 * link and the fingerprint changes. A player's smaller graph has its own
 * fingerprint, so one person's layout is never served for another's pages.
 */

export type Positions = Record<string, GraphPoint>;

/** FNV-1a over the ids and links, as two independent 32-bit lanes (about 64 bits in all). */
export function graphFingerprint(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x9e3779b9;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) ^ (h2 >>> 13);
    }
  };
  for (const n of nodes) feed(`n${n.id};`);
  for (const e of edges) feed(`e${e.source}>${e.target}:${e.relation};`);
  return `${nodes.length}.${edges.length}.${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}`;
}

export function createLayoutCache(
  layout: (nodes: GraphNode[], edges: GraphEdge[]) => Positions,
  maxEntries = 24,
) {
  const cache = new Map<string, Positions>();
  return {
    get(nodes: GraphNode[], edges: GraphEdge[]): Positions {
      const key = graphFingerprint(nodes, edges);
      const hit = cache.get(key);
      if (hit) {
        // Moving the key to the newest end keeps the busiest layouts.
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const positions = layout(nodes, edges);
      cache.set(key, positions);
      if (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
      return positions;
    },
    size: () => cache.size,
  };
}
