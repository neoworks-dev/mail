// The daily digest: decides once a day, at the configured hour, that a digest is due and tells
// the UI, which writes it with the assistant. Also serves the unread mail it is written from.

import type { Context } from '@neoworks/extension-system'
import { startDigestScheduler } from '../../mail/digest'

const CANDIDATE_LIMIT = 60

export const digest = {
	name: 'digest',
	inject: ['store', 'paths', 'rpc'],
	apply(ctx: Context) {
		ctx.effect(
			() => startDigestScheduler(ctx.paths.file('digest.json'), () => ctx.rpc.broadcast('digest.due', null)),
			'digest scheduler'
		)
		ctx.rpc.handle('digest.candidates', () => ctx.store.digestCandidates(CANDIDATE_LIMIT))
	}
}
