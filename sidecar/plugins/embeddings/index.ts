// Embeds new messages in the background with a local model, and serves semantic search over
// the embeddings. Everything here is best-effort: a first run without network (the model
// downloads once) just retries on the next pass. `mail/embedded` tells the classifier when a
// batch is done.

import type { Context } from '@neoworks/extension-system'
import type { EmbeddingStatus } from '../../../shared/mail'
import { bufferFromVector, cosineSimilarity, vectorFromBuffer } from '../../mail/classify'
import {
	EMBEDDING_MODEL,
	embedPassages,
	embedQuery,
	setModelCacheDirectory
} from '../../mail/embedder'

const EMBED_BATCH_SIZE = 16
const EMBED_INTERVAL_MS = 20_000
const SEARCH_LIMIT = 100

export const embeddings = {
	name: 'embeddings',
	inject: ['store', 'paths', 'rpc'],
	apply(ctx: Context) {
		setModelCacheDirectory(ctx.paths.file('models'))
		const logger = ctx.logger('embeddings')
		let running = false
		let errorLogged = false
		let latestStatus: EmbeddingStatus | null = null

		const reportStatus = (passRunning: boolean, error: string | null): void => {
			latestStatus = {
				pending: ctx.store.embeddingBacklog(EMBEDDING_MODEL),
				running: passRunning,
				error
			}
			ctx.rpc.broadcast('embeddings.status', latestStatus)
		}

		const runPass = async (): Promise<void> => {
			if (running) return
			running = true
			try {
				const candidates = ctx.store.embeddingCandidates(EMBEDDING_MODEL, EMBED_BATCH_SIZE)
				if (candidates.length > 0) {
					reportStatus(true, null)
					const vectors = await embedPassages(candidates.map((candidate) => candidate.text))
					for (let index = 0; index < candidates.length; index += 1) {
						ctx.store.insertEmbedding(
							candidates[index].messageId,
							EMBEDDING_MODEL,
							bufferFromVector(vectors[index])
						)
					}
				}
				ctx.emit('mail/embedded')
				errorLogged = false
				reportStatus(false, null)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				if (!errorLogged) {
					logger.warn(`embedding pass failed (will retry): ${message}`)
					errorLogged = true
				}
				reportStatus(false, message)
			} finally {
				running = false
			}
		}

		ctx.effect(() => {
			const timer = setInterval(() => void runPass(), EMBED_INTERVAL_MS)
			void runPass()
			return () => clearInterval(timer)
		}, 'embedding loop')

		ctx.rpc.handle('embeddings.status', () => latestStatus)

		// Brute-force cosine search over the local embeddings.
		ctx.rpc.handle('search.semantic', async (query, accountId) => {
			const queryVector = await embedQuery(query)
			const scored = ctx.store.allEmbeddings(EMBEDDING_MODEL, accountId).map((candidate) => ({
				messageId: candidate.messageId,
				similarity: cosineSimilarity(queryVector, vectorFromBuffer(candidate.vector))
			}))
			scored.sort((first, second) => second.similarity - first.similarity)
			return ctx.store.summariesWithFolder(
				scored.slice(0, SEARCH_LIMIT).map((entry) => entry.messageId)
			)
		})
	}
}
