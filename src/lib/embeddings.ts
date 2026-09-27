/**
 * Local, no-API-key text embeddings via a small ONNX sentence-transformer
 * (all-MiniLM-L6-v2, 384 dimensions) run through @huggingface/transformers'
 * WASM backend. Deliberately not `server-only` — it's used from standalone
 * scripts as well as (optionally) request-time code.
 *
 * The model (~30MB) is downloaded once and cached under
 * `node_modules/.cache` / the OS cache dir on first use.
 */
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (!loading) {
    loading = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2") as Promise<
      FeatureExtractionPipeline
    >;
  }
  extractor = await loading;
  return extractor;
}

export const EMBEDDING_DIMENSIONS = 384;

/** Returns a unit-length 384-dim embedding for the given text. */
export async function embed(text: string): Promise<number[]> {
  const model = await getExtractor();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/** Text an entry is embedded from — kept identical between corpus indexing and query time. */
export function entryEmbeddingText(input: {
  name: string;
  summary: string;
  body: string;
  fields?: Record<string, string>;
}): string {
  const fieldText = Object.values(input.fields ?? {}).join(" ");
  return [input.name, input.summary, fieldText, input.body.slice(0, 2000)]
    .filter(Boolean)
    .join("\n");
}
