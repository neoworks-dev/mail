// Command palette model: plain data + filtering, kept free of Svelte state so
// the ranking logic is unit-testable.

export interface PaletteCommand {
	id: string
	label: string
	/** Keyboard shortcut shown right-aligned, e.g. "e" or "ctrl+k". */
	shortcut: string | null
	run: () => void
}

/**
 * Case-insensitive filter: every whitespace-separated query word must appear
 * in the label. Commands whose label starts with the first word rank first.
 */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word.length > 0)
	if (words.length === 0) return commands

	const matches = commands.filter((command) => {
		const label = command.label.toLowerCase()
		return words.every((word) => label.includes(word))
	})
	const firstWord = words[0]
	const prefixed = matches.filter((command) => command.label.toLowerCase().startsWith(firstWord))
	const rest = matches.filter((command) => !command.label.toLowerCase().startsWith(firstWord))
	return [...prefixed, ...rest]
}
