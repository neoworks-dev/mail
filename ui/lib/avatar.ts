// What a sender's avatar shows: up to two initials.

/**
 * "Ada Lovelace" gives "AL". Without a name the address's part before the @ stands in, split at
 * dots, dashes and underscores, so "moritz.utcke@gmx.de" gives "MU". Nothing gives "?".
 */
export function avatarInitials(name: string, address: string): string {
	const nameWords = wordsOf(name)
	if (nameWords.length > 0) return initialsOf(nameWords)
	const localPart = address.split('@')[0] || ''
	const addressWords = wordsOf(localPart.replace(/[._-]+/g, ' '))
	if (addressWords.length > 0) return initialsOf(addressWords)
	return '?'
}

function initialsOf(words: string[]): string {
	if (words.length === 1) return firstLetter(words[0]).toUpperCase()
	return (firstLetter(words[0]) + firstLetter(words[1])).toUpperCase()
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
