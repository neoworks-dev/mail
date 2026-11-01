<!--
  The thread's actions, as in Gmail: archive, delete, mark unread, move and flag after back and
  forward, then other plugins' buttons from the `thread.actions` slot and a "More" menu of the
  commands that list themselves in `thread.more`, such as the assistant's. They apply to its
  newest message in the folder being shown, as the keys do; archiving, deleting and marking
  unread close the tab. Replying sits under the thread.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import {
		currentTheme,
		IconButton,
		Menu,
		typeStyle,
		type MenuEntry
	} from '@neoworks/svelte-gpui-ui'
	import starFilledIcon from '@phosphor-icons/core/fill/star-fill.svg'
	import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
	import dotsIcon from '@phosphor-icons/core/regular/dots-three.svg'
	import unreadIcon from '@phosphor-icons/core/regular/envelope-simple.svg'
	import folderIcon from '@phosphor-icons/core/regular/folder-simple.svg'
	import starIcon from '@phosphor-icons/core/regular/star.svg'
	import trashIcon from '@phosphor-icons/core/regular/trash.svg'
	import type { ThreadMessage } from '../../../shared/mail'
	import Slot from '../../kernel/slots/Slot.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import { folderDisplayName } from '../sidebar/folders'
	import { describeError } from './format'
	import { actionTarget, type ReadingServices } from './services'

	let {
		services,
		tab,
		paneIndex
	}: { services: ReadingServices; tab: ReadingTab; paneIndex: number } = $props()

	const theme = $derived(currentTheme())
	let actionError = $state<string | null>(null)

	const target = $derived(actionTarget(services, tab))

	const flagLabel = $derived.by(() => {
		if (target && target.flagged) return 'Remove flag (s)'
		return 'Flag (s)'
	})

	const moveItems = $derived.by((): MenuEntry[] => {
		const current = target
		if (!current) return []
		return services.accounts.state.folders
			.filter(
				(folder) => folder.accountId === current.accountId && folder.folderId !== current.folderId
			)
			.map((folder) => ({
				label: folderDisplayName(folder),
				onselect: () =>
					void closingAction((message) => services.mailbox.move(message, folder.folderId))
			}))
	})

	const moreItems = $derived.by((): MenuEntry[] =>
		services.commands.inMenu('thread.more').map((command) => ({
			label: command.title,
			icon: command.icon,
			onselect: () => void run(() => runCommand(command.id))
		}))
	)

	async function runCommand(id: string): Promise<void> {
		await services.commands.run(id)
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
	{#if target}
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
			onpress={() => void closingAction((message) => services.mailbox.remove(message))}
		/>
		<IconButton
			icon={unreadIcon}
			label="Mark as unread (u)"
			size="sm"
			onpress={() => void markUnread()}
		/>
		{#if moveItems.length > 0}
			<Menu items={moveItems} placement="bottom-start">
				{#snippet trigger(triggerProps)}
					<IconButton icon={folderIcon} label="Move to…" size="sm" onpress={triggerProps.onpress} />
				{/snippet}
			</Menu>
		{/if}
		<IconButton
			icon={starIcon}
			selectedIcon={starFilledIcon}
			selected={target.flagged}
			label={flagLabel}
			size="sm"
			onpress={() => void toggleFlag()}
		/>
	{/if}
	{#if actionError}
		<Text
			style={{
				...typeStyle('caption'),
				color: theme.colors.danger,
				maxWidth: 260,
				truncate: true,
				marginLeft: 6
			}}
		>
			{actionError}
		</Text>
	{/if}
	<View style={{ flex: 1, minWidth: 6 }} />
	<Slot name="thread.actions" props={{ tab }} />
	{#if moreItems.length > 0}
		<Menu items={moreItems} placement="bottom-end">
			{#snippet trigger(triggerProps)}
				<IconButton icon={dotsIcon} label="More" size="sm" onpress={triggerProps.onpress} />
			{/snippet}
		</Menu>
	{/if}
</View>
