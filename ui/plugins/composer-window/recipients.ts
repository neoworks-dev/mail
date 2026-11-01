// Recipient list editing for the address fields: the term being typed is what follows the last
// comma, and picking a suggestion replaces it.

export interface Suggestion {
	address: string
	name: string
}

export function currentTerm(value: string): string {
	const lastComma = value.lastIndexOf(',')
	return value.slice(lastComma + 1).trim()
}

export function applySuggestion(value: string, suggestion: Suggestion): string {
	const lastComma = value.lastIndexOf(',')
	let kept = ''
	if (lastComma !== -1) kept = `${value.slice(0, lastComma + 1)} `
	return `${kept}${suggestion.address}, `
}
