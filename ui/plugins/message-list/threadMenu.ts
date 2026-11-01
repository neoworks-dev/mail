// The right-press menu of a conversation. Menus have no submenus, so "Category" and "Move to"
// reopen the menu in place with their choices.

import type { MenuItem } from '@neoworks/svelte-gpui/ui'
import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
import arrowBendIcon from '@phosphor-icons/core/regular/arrow-bend-up-left.svg'
import envelopeIcon from '@phosphor-icons/core/regular/envelope-simple.svg'
import envelopeOpenIcon from '@phosphor-icons/core/regular/envelope-open.svg'
import folderIcon from '@phosphor-icons/core/regular/folder.svg'
import plusIcon from '@phosphor-icons/core/regular/plus.svg'
import splitIcon from '@phosphor-icons/core/regular/square-split-horizontal.svg'
import starIcon from '@phosphor-icons/core/regular/star.svg'
import tagIcon from '@phosphor-icons/core/regular/tag.svg'
import trashIcon from '@phosphor-icons/core/regular/trash.svg'
import { ALL_MAIL_LABELS, type MailFolder, type ThreadSummary } from '../../../shared/mail'
import { labelTitle } from '../../components/message-list/labels'
import type { CommandsService } from '../../kernel/commands'
import type { MailboxService } from '../mailbox/service.svelte'
import type { ReaderService } from '../reader/service.svelte'

export interface ThreadMenuServices {
	mailbox: MailboxService
	reader: ReaderService
	commands: CommandsService
	/** The selected account's folders, to move into. */
	folders: MailFolder[]
	/** Shows another list of items where the menu was. */
	reopen: (items: MenuItem[]) => void
}

export function threadMenuItems(thread: ThreadSummary, services: ThreadMenuServices): MenuItem[] {
	return [
		...openItems(thread, services),
		{ separator: true },
		...stateItems(thread, services),
		{ separator: true },
		...sortItems(thread, services),
		{ separator: true },
		...removeItems(thread, services)
	]
}

function openItems(thread: ThreadSummary, { reader, commands }: ThreadMenuServices): MenuItem[] {
	return [
		{
			label: 'Open',
			icon: envelopeIcon,
			onselect: () => void reader.openThread(thread.accountId, thread.threadId)
		},
		{
			label: 'Open in new tab',
			icon: plusIcon,
			onselect: () =>
				void reader.openInNewTab({
					kind: 'thread',
					accountId: thread.accountId,
					threadId: thread.threadId
				})
		},
		{
			label: 'Open in split view',
			icon: splitIcon,
			onselect: () => void reader.openInSplit(thread.accountId, thread.threadId)
		},
		{
			label: 'Reply',
			icon: arrowBendIcon,
			onselect: () => void replyTo(thread, reader, commands)
		}
	]
}

async function replyTo(
	thread: ThreadSummary,
	reader: ReaderService,
	commands: CommandsService
): Promise<void> {
	await reader.openThread(thread.accountId, thread.threadId)
	await commands.run('thread.reply')
}

function stateItems(thread: ThreadSummary, { mailbox }: ThreadMenuServices): MenuItem[] {
	const readItem: MenuItem = {
		label: 'Mark as read',
		icon: envelopeOpenIcon,
		onselect: () => void markThreadRead(thread, mailbox)
	}
	if (thread.threadUnread === 0) {
		readItem.label = 'Mark as unread'
		readItem.icon = envelopeIcon
		readItem.onselect = () => void mailbox.markSeen(thread, false)
	}
	let flagLabel = 'Flag'
	if (thread.flagged) flagLabel = 'Remove flag'
	return [
		readItem,
		{ label: flagLabel, icon: starIcon, onselect: () => void mailbox.toggleFlagged(thread) }
	]
}

async function markThreadRead(thread: ThreadSummary, mailbox: MailboxService): Promise<void> {
	thread.threadUnread = 0
	await mailbox.markSeen(thread, true)
}

function sortItems(thread: ThreadSummary, services: ThreadMenuServices): MenuItem[] {
	const items: MenuItem[] = [
		{
			label: 'Category…',
			icon: tagIcon,
			onselect: () => services.reopen(categoryItems(thread, services.mailbox))
		}
	]
	const targets = moveTargets(thread, services.folders)
	if (targets.length > 0) {
		items.push({
			label: 'Move to…',
			icon: folderIcon,
			onselect: () => services.reopen(moveItems(thread, targets, services.mailbox))
		})
	}
	return items
}

function categoryItems(thread: ThreadSummary, mailbox: MailboxService): MenuItem[] {
	const items: MenuItem[] = [
		{
			label: 'No category',
			checked: thread.label === null,
			onselect: () => void mailbox.setLabel(thread, null)
		}
	]
	for (const label of ALL_MAIL_LABELS) {
		items.push({
			label: labelTitle(label),
			checked: thread.label === label,
			onselect: () => void mailbox.setLabel(thread, label)
		})
	}
	return items
}

function moveTargets(thread: ThreadSummary, folders: MailFolder[]): MailFolder[] {
	return folders.filter(
		(folder) => folder.accountId === thread.accountId && folder.folderId !== thread.folderId
	)
}

function moveItems(
	thread: ThreadSummary,
	targets: MailFolder[],
	mailbox: MailboxService
): MenuItem[] {
	return targets.map((folder) => ({
		label: folder.name,
		onselect: () => void mailbox.move(thread, folder.folderId)
	}))
}

function removeItems(thread: ThreadSummary, { mailbox }: ThreadMenuServices): MenuItem[] {
	return [
		{ label: 'Archive', icon: archiveIcon, onselect: () => void mailbox.archive(thread) },
		{ label: 'Delete', icon: trashIcon, danger: true, onselect: () => void mailbox.remove(thread) }
	]
}
