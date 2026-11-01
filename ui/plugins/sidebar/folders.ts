// Which folders are the well-known ones (inbox, drafts, sent, …), by special-use flag or by
// name in English and German, and in what order the sidebar shows them.

import type { MailFolder } from '../../../shared/mail'

export type SpecialKind = 'inbox' | 'drafts' | 'sent' | 'archive' | 'junk' | 'trash'

export const SPECIAL_ORDER: SpecialKind[] = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash']

const NAME_KINDS: Record<string, SpecialKind> = {
	inbox: 'inbox',
	drafts: 'drafts',
	draft: 'drafts',
	entwürfe: 'drafts',
	sent: 'sent',
	'sent messages': 'sent',
	'sent items': 'sent',
	gesendet: 'sent',
	'gesendete elemente': 'sent',
	archive: 'archive',
	archives: 'archive',
	archiv: 'archive',
	junk: 'junk',
	spam: 'junk',
	trash: 'trash',
	bin: 'trash',
	papierkorb: 'trash',
	'deleted items': 'trash',
	'deleted messages': 'trash',
	gelöscht: 'trash'
}

const SPECIAL_USE_KINDS: Record<string, SpecialKind> = {
	'\\Inbox': 'inbox',
	'\\Drafts': 'drafts',
	'\\Sent': 'sent',
	'\\Archive': 'archive',
	'\\Junk': 'junk',
	'\\Trash': 'trash'
}

export function specialKind(folder: MailFolder): SpecialKind | null {
	if (folder.path === 'INBOX') return 'inbox'
	if (folder.specialUse && SPECIAL_USE_KINDS[folder.specialUse]) return SPECIAL_USE_KINDS[folder.specialUse]
	const byName = NAME_KINDS[folder.name.toLowerCase()]
	if (byName) return byName
	return null
}

export interface PrimaryFolder {
	folder: MailFolder
	kind: SpecialKind
}

/** The first folder of each well-known kind, in sidebar order. */
export function primaryFolders(folders: MailFolder[]): PrimaryFolder[] {
	const found = new Map<SpecialKind, MailFolder>()
	for (const folder of folders) {
		const kind = specialKind(folder)
		if (kind && !found.has(kind)) found.set(kind, folder)
	}
	const ordered: PrimaryFolder[] = []
	for (const kind of SPECIAL_ORDER) {
		const folder = found.get(kind)
		if (folder) ordered.push({ folder, kind })
	}
	return ordered
}

export function otherFolders(folders: MailFolder[], primary: PrimaryFolder[]): MailFolder[] {
	const primaryIds = new Set(primary.map((entry) => entry.folder.folderId))
	return folders.filter((folder) => !primaryIds.has(folder.folderId))
}

export function folderDisplayName(folder: MailFolder): string {
	if (folder.path === 'INBOX') return 'Inbox'
	return folder.name
}
