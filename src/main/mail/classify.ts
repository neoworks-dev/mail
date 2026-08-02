// Embedding-space classification: one centroid per label from trusted
// (heuristic/user) examples, nearest-centroid with a similarity floor for the
// rest. Pure math, no I/O — the engine wires it to the store.

export interface LabeledVector {
	label: string
	vector: Float32Array
}

const MIN_EXAMPLES_PER_LABEL = 3

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0
	let normA = 0
	let normB = 0
	for (let index = 0; index < a.length; index += 1) {
		dot += a[index] * b[index]
		normA += a[index] * a[index]
		normB += b[index] * b[index]
	}
	if (normA === 0 || normB === 0) return 0
	return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Mean vector per label; labels with too few examples are skipped. */
export function buildCentroids(examples: LabeledVector[]): Map<string, Float32Array> {
	const sums = new Map<string, { sum: Float64Array; count: number }>()
	for (const example of examples) {
		let entry = sums.get(example.label)
		if (!entry) {
			entry = { sum: new Float64Array(example.vector.length), count: 0 }
			sums.set(example.label, entry)
		}
		for (let index = 0; index < example.vector.length; index += 1) {
			entry.sum[index] += example.vector[index]
		}
		entry.count += 1
	}

	const centroids = new Map<string, Float32Array>()
	for (const [label, entry] of sums) {
		if (entry.count < MIN_EXAMPLES_PER_LABEL) continue
		const centroid = new Float32Array(entry.sum.length)
		for (let index = 0; index < entry.sum.length; index += 1) {
			centroid[index] = entry.sum[index] / entry.count
		}
		centroids.set(label, centroid)
	}
	return centroids
}

export interface CentroidMatch {
	label: string
	similarity: number
}

export function nearestCentroid(
	vector: Float32Array,
	centroids: Map<string, Float32Array>
): CentroidMatch | null {
	const matches = centroidMatches(vector, centroids)
	if (matches.length === 0) return null
	return matches[0]
}

/** All centroid similarities, best first — callers check the winning margin. */
export function centroidMatches(
	vector: Float32Array,
	centroids: Map<string, Float32Array>
): CentroidMatch[] {
	const matches: CentroidMatch[] = []
	for (const [label, centroid] of centroids) {
		matches.push({ label, similarity: cosineSimilarity(vector, centroid) })
	}
	matches.sort((a, b) => b.similarity - a.similarity)
	return matches
}

export function vectorFromBuffer(buffer: Buffer): Float32Array {
	return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
}

export function bufferFromVector(vector: Float32Array): Buffer {
	return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
}
