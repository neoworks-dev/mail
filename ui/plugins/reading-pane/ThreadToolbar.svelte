<!--
  The thread's actions. They apply to its newest message in the folder being shown, as the keys
  do; archiving, deleting and marking unread close the tab. Other plugins add buttons through
  the `thread.actions` slot.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import {
		Chip,
		currentTheme,
		IconButton,
		Menu,
		typeStyle,
		type MenuEntry
	} from '@neoworks/svelte-gpui-ui'
	import starFilledIcon from '@phosphor-icons/core/fill/star-fill.svg'
	import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
	import replyAllIcon from '@phosphor-icons/core/regular/arrow-bend-double-up-left.svg'
	import replyIcon from '@phosphor-icons/core/regular/arrow-bend-up-left.svg'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import unreadIcon from '@phosphor-icons/core/regular/envelope-simple.svg'
	import pencilIcon from '@phosphor-icons/core/regular/pencil-simple.svg'
	import starIcon from '@phosphor-icons/core/regular/star.svg'
	import trashIcon from '@phosphor-icons/core/regular/trash.svg'
	import { ALL_MAIL_LABELS, type ThreadMessage } from '../../../shared/mail'
	import Slot from '../../kernel/slots/Slot.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import { describeError } from './format'
	import type { ReadingServices } from './services'

	let {
		services,
		tab,
		paneIndex
	}: { services: ReadingServices; tab: ReadingTab; paneIndex: number } = $props()

	const theme = $derived(currentTheme())
	let actionError = $state<string | null>(null)

	/** The newest message in the folder being shown, else the newest of all. */
	const target = $derived.by((): ThreadMessage | null => {
		const messages = tab.messages
		if (messages.length === 0) return null
		const folderId = services.mailbox.selectedFolderId
		const inFolder = messages.filter((message) => message.folderId === folderId)
		if (inFolder.length > 0) return inFolder[inFolder.length - 1]
		return messages[messages.length - 1]
	})

	const newest = $derived(tab.messages[tab.messages.length - 1])

	const isDraft = $derived.by(() => {
		if (!target) return false
		const folder = services.accounts.state.folders.find(
			(entry) => entry.folderId === target.folderId
		)
		if (!folder) return false
		return folder.specialUse === '\\Drafts' || folder.name === 'Drafts'
	})

	const flagLabel = $derived.by(() => {
		if (target && target.flagged) return 'Remove flag (s)'
		return 'Flag (s)'
	})

	const labelText = $derived.by(() => {
		if (!target || target.label === null) return 'No category'
		return capitalize(target.label)
	})

	const labelItems = $derived.by((): MenuEntry[] => {
		const current = target
		if (!current) return []
		const choices: MenuEntry[] = [
			{
				label: 'No category',
				selected: current.label === null,
				onselect: () => setLabel(current, null)
			}
		]
		for (const label of ALL_MAIL_LABELS) {
			choices.push({
				label: capitalize(label),
				selected: current.label === label,
				onselect: () => setLabel(current, label)
			})
		}
		return choices
	})

	const moveItems = $derived.by((): MenuEntry[] => {
		const current = target
		if (!current) return []
		return services.accounts.state.folders
			.filter(
				(folder) => folder.accountId === current.accountId && folder.folderId !== current.folderId
			)
			.map((folder) => ({
				label: folder.name,
				onselect: () =>
					void closingAction((message) => services.mailbox.move(message, folder.folderId))
			}))
	})

	function capitalize(word: string): string {
		return word.charAt(0).toUpperCase() + word.slice(1)
	}

	async function run(action: () => Promise<void>): Promise<void> {
		actionError = null
		services.reader.setActivePane(paneIndex)
		try {
			await action()
		} catch (error) {
			actionError = describeError(error)
		}
	}

	/** An action that takes the message out of view, so the tab closes first. */
	async function closingAction(action: (message: ThreadMessage) => Promise<void>): Promise<void> {
		const current = target
		if (!current) return
		await run(async () => {
			services.reader.closeActive()
			await action(current)
		})
	}

	function setLabel(message: ThreadMessage, label: string | null): void {
		if (label === message.label) return
		void run(() => services.mailbox.setLabel(message, label))
	}

	async function reply(replyAll: boolean): Promise<void> {
		const message = newest
		if (!message) return
		await run(async () => {
			const body = await services.reader.loadBody(message.messageId)
			services.composer.openReply(message, body, replyAll)
		})
	}

	async function editDraft(): Promise<void> {
		const current = target
		if (!current) return
		await run(async () => {
			const body = await services.reader.loadBody(current.messageId)
			await services.composer.editDraft(current, body)
		})
	}

	async function toggleFlag(): Promise<void> {
		const current = target
		if (!current) return
		await run(() => services.mailbox.toggleFlagged(current))
	}

	async function markUnread(): Promise<void> {
		await closingAction((message) => services.mailbox.markSeen(message, false))
	}
</script>

<View style={{ direction: 'row', align: 'center', gap: 2, wrap: true, rowGap: 6 }}>
	{#if actionError}
		<Text
			style={{
				...typeStyle('caption'),
				color: theme.colors.danger,
				maxWidth: 260,
				truncate: true,
				marginRight: 6
			}}
		>
			{actionError}
		</Text>
	{/if}
	{#if isDraft}
		<IconButton icon={pencilIcon} label="Edit draft" size="sm" onpress={() => void editDraft()} />
	{:else}
		<IconButton icon={replyIcon} label="Reply (r)" size="sm" onpress={() => void reply(false)} />
		<IconButton
			icon={replyAllIcon}
			label="Reply all (a)"
			size="sm"
			onpress={() => void reply(true)}
		/>
	{/if}
	<Slot name="thread.actions" props={{ tab }} />
	{#if target}
		<View style={{ width: 1, height: 18, background: theme.colors.line, marginX: 6 }} />
		<IconButton
			icon={starIcon}
			selectedIcon={starFilledIcon}
			selected={target.flagged}
			label={flagLabel}
			size="sm"
			onpress={() => void toggleFlag()}
		/>
		<IconButton
			icon={unreadIcon}
			label="Mark as unread (u)"
			size="sm"
			onpress={() => void markUnread()}
		/>
		<IconButton
			icon={archiveIcon}
			label="Archive (e)"
			size="sm"
			onpress={() => void closingAction((message) => services.mailbox.archive(message))}
		/>
		<IconButton
			icon={trashIcon}
			label="Delete (#)"
			size="sm"
			style={{ color: theme.colors.danger }}
			onpress={() => void closingAction((message) => services.mailbox.remove(message))}
		/>
		<View style={{ flex: 1, minWidth: 6 }} />
		<Menu items={labelItems} placement="bottom-end">
			{#snippet trigger(triggerProps)}
				<Chip label={labelText} trailingIcon={caretDownIcon} onpress={triggerProps.onpress} />
			{/snippet}
		</Menu>
		{#if moveItems.length > 0}
			<Menu items={moveItems} placement="bottom-end">
				{#snippet trigger(triggerProps)}
					<Chip
						label="Move to…"
						trailingIcon={caretDownIcon}
						onpress={triggerProps.onpress}
						style={{ marginLeft: 4 }}
					/>
				{/snippet}
			</Menu>
		{/if}
	{/if}
</View>
