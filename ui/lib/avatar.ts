// What a sender's avatar shows: up to two initials, and one of the theme's colour scales picked
// from the address, so a sender keeps their colour everywhere.

export const AVATAR_SCALES = ['lake', 'larch', 'rock', 'pine'] as const

export type AvatarScale = (typeof AVATAR_SCALES)[number]

/** "Ada Lovelace" gives "AL", "ada@example.com" gives "A", nothing gives "?". */
export function avatarInitials(name: string, address: string): string {
	const words = wordsOf(name)
	if (words.length >= 2) return (firstLetter(words[0]) + firstLetter(words[1])).toUpperCase()
	if (words.length === 1) return firstLetter(words[0]).toUpperCase()
	const localPart = address.split('@')[0]
	if (localPart === undefined || localPart === '') return '?'
	return firstLetter(localPart).toUpperCase()
}

export function avatarScale(address: string): AvatarScale {
	const key = address.toLowerCase()
	let hash = 0
	for (let index = 0; index < key.length; index++) {
		hash = (hash * 31 + key.charCodeAt(index)) >>> 0
	}
	return AVATAR_SCALES[hash % AVATAR_SCALES.length]
}

/** Words that start with a letter or digit, so quotes and brackets around a name don't count. */
function wordsOf(name: string): string[] {
	return name
		.split(/\s+/)
		.map((word) => word.replace(/^[^\p{L}\p{N}]+/u, ''))
		.filter((word) => word !== '')
}

function firstLetter(word: string): string {
	return Array.from(word)[0] || ''
}
