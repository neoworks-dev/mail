import { app } from 'electron'
import { join } from 'node:path'

// Local embeddings via transformers.js (ONNX on CPU). The model downloads to
// userData/models on first use (~120 MB quantized) and loads lazily so app
// startup never pays for it. multilingual-e5 handles German + English mail.

export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small'

type FeatureExtractor = (
	texts: string[],
	options: { pooling: 'mean'; normalize: boolean }
) => Promise<{ tolist: () => number[][] }>

let extractorPromise: Promise<FeatureExtractor> | null = null

async function loadExtractor(): Promise<FeatureExtractor> {
	const transformers = await import('@huggingface/transformers')
	transformers.env.cacheDir = join(app.getPath('userData'), 'models')
	const pipeline = await transformers.pipeline('feature-extraction', EMBEDDING_MODEL, {
		dtype: 'q8'
	})
	return pipeline as unknown as FeatureExtractor
}

function extractor(): Promise<FeatureExtractor> {
	if (!extractorPromise) {
		extractorPromise = loadExtractor().catch((error: Error) => {
			// A failed load (offline first run) must retry next call, not stick.
			extractorPromise = null
			throw error
		})
	}
	return extractorPromise
}

/**
 * Embed texts as e5 "passage" documents. Returns unit-normalized vectors.
 */
export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
	return embed(texts.map((text) => `passage: ${text}`))
}

/** Embed a search query against passage embeddings. */
export async function embedQuery(text: string): Promise<Float32Array> {
	const [vector] = await embed([`query: ${text}`])
	return vector
}

async function embed(texts: string[]): Promise<Float32Array[]> {
	const model = await extractor()
	const output = await model(texts, { pooling: 'mean', normalize: true })
	return output.tolist().map((values) => new Float32Array(values))
}
