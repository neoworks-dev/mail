// The full-text search marks each hit in a snippet as `[hit]`; the bar shows hits in bold.

export interface SnippetPart {
	text: string
	hit: boolean
}

export function snippetParts(snippet: string): SnippetPart[] {
	const parts: SnippetPart[] = []
	for (const piece of snippet.split(/(\[[^\]]*\])/)) {
		if (piece === '') continue
		const hit = piece.startsWith('[') && piece.endsWith(']')
		if (hit) {
			parts.push({ text: piece.slice(1, -1), hit: true })
			continue
		}
		parts.push({ text: piece, hit: false })
	}
	return parts
}
