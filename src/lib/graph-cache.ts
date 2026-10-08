import "server-only";
import { layoutGraph, type GraphEdge, type GraphNode } from "@/lib/graph-layout";
import { createLayoutCache, type Positions } from "@/lib/layout-cache";

/**
 * The force layout is the most expensive thing a page request does (about a
 * tenth of a second of blocked event loop for the whole codex, even after the
 * grid-based repulsion), and for a given set of pages and links it always gives
 * the same answer. So the server computes it once and remembers it.
 *
 * Each server instance keeps its own small cache. Because entries are keyed by
 * content, that is correct however many instances run behind a load balancer:
 * there is no shared state to keep in step.
 */
const cache = createLayoutCache(layoutGraph);

export function layoutGraphCached(nodes: GraphNode[], edges: GraphEdge[]): Positions {
  return cache.get(nodes, edges);
}
