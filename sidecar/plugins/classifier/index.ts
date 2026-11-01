// Labels messages the header heuristics left blank, from their embeddings: each label's
// user-labelled examples form a centroid, and a message takes a label only when it is clearly
// closest to one.

import type { Context } from '@neoworks/extension-system'
import { buildCentroids, centroidMatches, vectorFromBuffer } from '../../mail/classify'
import { EMBEDDING_MODEL } from '../../mail/embedder'

const CLASSIFY_BATCH_SIZE = 200
/** Accept a label only when clearly closest to one centroid. */
const ML_MIN_SIMILARITY = 0.85
const ML_MIN_MARGIN = 0.02

export const classifier = {
	name: 'classifier',
	inject: ['store'],
	apply(ctx: Context) {
		ctx.on('mail/embedded', () => classifyPending(ctx))
	}
}

function classifyPending(ctx: Context): void {
	const pending = ctx.store.classifiableEmbeddings(EMBEDDING_MODEL, CLASSIFY_BATCH_SIZE)
	if (pending.length === 0) return

	const examples = ctx.store.labeledEmbeddings(EMBEDDING_MODEL).map((row) => ({
		label: row.label,
		vector: vectorFromBuffer(row.vector)
	}))
	const centroids = buildCentroids(examples)
	if (centroids.size === 0) return

	const changedFolders = new Map<number, number>()
	for (const candidate of pending) {
		const matches = centroidMatches(vectorFromBuffer(candidate.vector), centroids)
		if (matches.length === 0) continue
		const best = matches[0]
		if (best.similarity < ML_MIN_SIMILARITY) continue
		if (matches.length > 1 && best.similarity - matches[1].similarity < ML_MIN_MARGIN) continue
		ctx.store.setMessageLabel(candidate.messageId, best.label, 'ml')
		changedFolders.set(candidate.folderId, candidate.accountId)
	}
	for (const [folderId, accountId] of changedFolders) {
		ctx.emit('mail/messages-changed', accountId, folderId)
	}
}
