import { describe, expect, test } from 'bun:test'
import {
	bufferFromVector,
	buildCentroids,
	cosineSimilarity,
	nearestCentroid,
	vectorFromBuffer
} from '../src/main/mail/classify'

function vec(...values: number[]): Float32Array {
	return new Float32Array(values)
}

describe('cosineSimilarity', () => {
	test('identical direction is 1, orthogonal is 0', () => {
		expect(cosineSimilarity(vec(1, 0), vec(2, 0))).toBeCloseTo(1)
		expect(cosineSimilarity(vec(1, 0), vec(0, 3))).toBeCloseTo(0)
	})

	test('zero vector yields 0', () => {
		expect(cosineSimilarity(vec(0, 0), vec(1, 1))).toBe(0)
	})
})

describe('buildCentroids + nearestCentroid', () => {
	test('labels below the example floor are skipped', () => {
		const centroids = buildCentroids([
			{ label: 'ad', vector: vec(1, 0) },
			{ label: 'ad', vector: vec(1, 0.2) }
		])
		expect(centroids.size).toBe(0)
	})

	test('classifies by nearest mean', () => {
		const centroids = buildCentroids([
			{ label: 'ad', vector: vec(1, 0) },
			{ label: 'ad', vector: vec(0.9, 0.1) },
			{ label: 'ad', vector: vec(1, 0.05) },
			{ label: 'newsletter', vector: vec(0, 1) },
			{ label: 'newsletter', vector: vec(0.1, 0.9) },
			{ label: 'newsletter', vector: vec(0.05, 1) }
		])
		const match = nearestCentroid(vec(0.95, 0.1), centroids)
		expect(match?.label).toBe('ad')
		expect(match !== null && match.similarity > 0.95).toBe(true)
	})
})

describe('vector <-> buffer round trip', () => {
	test('preserves values through Buffer storage', () => {
		const original = vec(0.25, -1.5, 3.75)
		const restored = vectorFromBuffer(Buffer.from(bufferFromVector(original)))
		expect([...restored]).toEqual([0.25, -1.5, 3.75])
	})
})
