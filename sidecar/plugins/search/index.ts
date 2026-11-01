// Full-text search over the local FTS5 index.

import type { Context } from '@neoworks/extension-system'

const SEARCH_LIMIT = 100

export const search = {
	name: 'search',
	inject: ['store', 'rpc'],
	apply(ctx: Context) {
		ctx.rpc.handle('search.text', (query, accountId) => ctx.store.search(query, accountId, SEARCH_LIMIT))
	}
}
