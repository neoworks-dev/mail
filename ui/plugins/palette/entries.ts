// What the command bar lists in command mode: every command that can run now, with the key it
// runs on, plus going to each folder and switching to each other account.

import type { Context } from '@neoworks/extension-system'
import { comboLabel } from '../../lib/keycombo'
import type { PaletteCommand } from '../../lib/palette'

export function paletteCommands(ctx: Context): PaletteCommand[] {
	return [...registeredCommands(ctx), ...folderCommands(ctx), ...accountCommands(ctx)]
}

function registeredCommands(ctx: Context): PaletteCommand[] {
	return ctx.commands
		.list()
		.filter((command) => !command.id.startsWith('palette.') && ctx.commands.canRun(command.id))
		.map((command) => ({
			id: command.id,
			label: command.title,
			shortcut: shortcutFor(ctx, command.id),
			run: () => void ctx.commands.run(command.id)
		}))
}

function shortcutFor(ctx: Context, commandId: string): string | null {
	const combo = ctx.keymap.comboFor(commandId)
	if (!combo || combo.key === '') return null
	return comboLabel(combo)
}

function folderCommands(ctx: Context): PaletteCommand[] {
	return ctx.accounts.state.folders.map((folder) => {
		let name = folder.name
		if (folder.path === 'INBOX') name = 'Inbox'
		return {
			id: `palette.folder.${folder.folderId}`,
			label: `Go to ${name}`,
			shortcut: null,
			run: () => void ctx.mailbox.openFolder(folder.folderId)
		}
	})
}

function accountCommands(ctx: Context): PaletteCommand[] {
	return ctx.accounts.state.accounts
		.filter((account) => account.accountId !== ctx.accounts.state.selectedAccountId)
		.map((account) => ({
			id: `palette.account.${account.accountId}`,
			label: `Switch account: ${account.email}`,
			shortcut: null,
			run: () => void ctx.accounts.select(account.accountId)
		}))
}
