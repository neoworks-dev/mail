import { describe, expect, test } from 'bun:test'
import { filterCommands, type PaletteCommand } from '../ui/lib/palette'

function command(id: string, label: string): PaletteCommand {
	return { id, label, shortcut: null, run: () => {} }
}

const COMMANDS = [
	command('compose', 'Compose new message'),
	command('archive', 'Archive conversation'),
	command('inbox', 'Go to Inbox'),
	command('trash', 'Go to Trash'),
	command('switch', 'Switch account: user@example.com')
]

describe('filterCommands', () => {
	test('empty query returns everything in order', () => {
		expect(filterCommands(COMMANDS, '')).toEqual(COMMANDS)
		expect(filterCommands(COMMANDS, '   ')).toEqual(COMMANDS)
	})

	test('matches case-insensitively anywhere in the label', () => {
		const result = filterCommands(COMMANDS, 'TRASH')
		expect(result.map((entry) => entry.id)).toEqual(['trash'])
	})

	test('all words must match', () => {
		const result = filterCommands(COMMANDS, 'go inbox')
		expect(result.map((entry) => entry.id)).toEqual(['inbox'])
	})

	test('label-prefix matches rank before substring matches', () => {
		const result = filterCommands(COMMANDS, 'go')
		expect(result.map((entry) => entry.id)).toEqual(['inbox', 'trash'])
	})

	test('no match returns empty', () => {
		expect(filterCommands(COMMANDS, 'zzz')).toEqual([])
	})
})
