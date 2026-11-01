<!--
  The folders column: the one main action, writing a new message, then all inboxes (with more
  than one account), the selected account's well-known
  folders with the inbox's categories under it, the rest behind a "Folders" disclosure, the
  account switcher and how sync and the search index are doing.
-->
<script lang="ts">
	import { ContextMenu, Icon, Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { MenuItem, PointerEvent } from '@neoworks/svelte-gpui/ui'
	import { Button, currentTheme, Divider } from '@neoworks/svelte-gpui-ui'
	import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
	import caretRightIcon from '@phosphor-icons/core/regular/caret-right.svg'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import caretUpDownIcon from '@phosphor-icons/core/regular/caret-up-down.svg'
	import folderIcon from '@phosphor-icons/core/regular/folder.svg'
	import notePencilIcon from '@phosphor-icons/core/regular/note-pencil.svg'
	import pencilSimpleIcon from '@phosphor-icons/core/regular/pencil-simple.svg'
	import paperPlaneIcon from '@phosphor-icons/core/regular/paper-plane-tilt.svg'
	import plusIcon from '@phosphor-icons/core/regular/plus.svg'
	import stackIcon from '@phosphor-icons/core/regular/stack-simple.svg'
	import trashIcon from '@phosphor-icons/core/regular/trash.svg'
	import trayIcon from '@phosphor-icons/core/regular/tray.svg'
	import warningIcon from '@phosphor-icons/core/regular/warning.svg'
	import { ALL_MAIL_LABELS, type MailFolder } from '../../../shared/mail'
	import { labelTitle } from '../../components/message-list/labels'
	import Avatar from '../../components/Avatar.svelte'
	import type { CommandsService } from '../../kernel/commands'
	import type { SettingsService } from '../../kernel/settings/service'
	import type { AccountsService } from '../accounts/service.svelte'
	import type { MailboxService } from '../mailbox/service.svelte'
	import { folderDisplayName, otherFolders, primaryFolders, type SpecialKind } from './folders'
	import SidebarRow from './SidebarRow.svelte'
	import SyncFooter from './SyncFooter.svelte'

	interface Props {
		accounts: AccountsService
		mailbox: MailboxService
		commands: CommandsService
		settings: SettingsService
	}

	let { accounts, mailbox, commands, settings }: Props = $props()

	const FOLDERS_OPEN_SETTING = 'sidebar.foldersOpen'

	const SPECIAL_ICONS: Record<SpecialKind, string> = {
		inbox: trayIcon,
		drafts: notePencilIcon,
		sent: paperPlaneIcon,
		archive: archiveIcon,
		junk: warningIcon,
		trash: trashIcon
	}

	/** Category rows under an inbox: everything, the priority pseudo-label, then each label. */
	const CATEGORIES: Array<string | null> = [null, '__priority', ...ALL_MAIL_LABELS]

	const theme = $derived(currentTheme())
	const primary = $derived(primaryFolders(accounts.state.folders))
	const others = $derived(otherFolders(accounts.state.folders, primary))
	const foldersOpen = $derived(settings.get(FOLDERS_OPEN_SETTING, false))
	const multipleAccounts = $derived(accounts.state.accounts.length > 1)

	let accountMenu: ContextMenu | undefined = $state()

	function categoryTitle(label: string | null): string {
		if (label === null) return 'All'
		return labelTitle(label)
	}

	function categoryCount(counts: Record<string, number>, label: string | null): number {
		if (label === null) return counts['__all'] || 0
		return counts[label] || 0
	}

	function folderSelected(folder: MailFolder, label: string | null): boolean {
		const view = mailbox.state.view
		if (!view || view.kind !== 'folder') return false
		return view.folderId === folder.folderId && view.label === label
	}

	function unifiedSelected(label: string | null): boolean {
		const view = mailbox.state.view
		if (!view || view.kind !== 'unified') return false
		return view.label === label
	}

	function toggleFolders(): void {
		settings.set(FOLDERS_OPEN_SETTING, !foldersOpen)
	}

	function folderToggleIcon(): string {
		if (foldersOpen) return caretDownIcon
		return caretRightIcon
	}

	function accountLabel(): string {
		const selected = accounts.selectedAccount
		if (selected) return selected.email
		return 'No account'
	}

	function openAccountMenu(event: PointerEvent): void {
		if (!accountMenu) return
		const items: MenuItem[] = accounts.state.accounts.map((account) => ({
			label: account.email,
			checked: account.accountId === accounts.state.selectedAccountId,
			onselect: () => void accounts.select(account.accountId)
		}))
		items.push({ separator: true })
		items.push({
			label: 'Add account',
			icon: plusIcon,
			onselect: () => void commands.run('accounts.add')
		})
		accountMenu.openAt(event.windowX, event.windowY, items)
	}
</script>

<View
	style={{
		width: 220,
		borderRightWidth: 1,
		borderColor: theme.colors.line,
		background: theme.colors.canvas
	}}
>
	<View style={{ paddingX: 8, paddingTop: 10, paddingBottom: 6 }}>
		<Button
			variant="primary"
			size="sm"
			icon={pencilSimpleIcon}
			full
			onpress={() => void commands.run('compose.new')}><Text>New message</Text></Button
		>
	</View>
	<Scroll style={{ flex: 1 }}>
		<View style={{ padding: 8, gap: 2 }}>
			{#if multipleAccounts}
				<SidebarRow
					title="All inboxes"
					icon={stackIcon}
					selected={unifiedSelected(null)}
					onpress={() => void mailbox.openUnified()}
				/>
				{#each CATEGORIES.slice(1) as label (label)}
					<SidebarRow
						title={categoryTitle(label)}
						indented
						count={categoryCount(accounts.state.unifiedLabelCounts, label)}
						selected={unifiedSelected(label)}
						onpress={() => void mailbox.openUnified(label)}
					/>
				{/each}
				<Divider style={{ marginY: 6 }} />
			{/if}

			{#each primary as entry (entry.folder.folderId)}
				<SidebarRow
					title={folderDisplayName(entry.folder)}
					icon={SPECIAL_ICONS[entry.kind]}
					count={entry.folder.unreadMessages}
					selected={folderSelected(entry.folder, null)}
					onpress={() => void mailbox.openFolder(entry.folder.folderId)}
				/>
				{#if entry.kind === 'inbox'}
					{#each CATEGORIES.slice(1) as label (label)}
						<SidebarRow
							title={categoryTitle(label)}
							indented
							count={categoryCount(accounts.state.inboxLabelCounts, label)}
							selected={folderSelected(entry.folder, label)}
							onpress={() => void mailbox.openFolder(entry.folder.folderId, label)}
						/>
					{/each}
				{/if}
			{/each}

			{#if others.length > 0}
				<SidebarRow
					title="Folders"
					icon={folderIcon}
					selected={false}
					trailingIcon={folderToggleIcon()}
					onpress={toggleFolders}
				/>
				{#if foldersOpen}
					{#each others as folder (folder.folderId)}
						<SidebarRow
							title={folderDisplayName(folder)}
							indented
							count={folder.unreadMessages}
							selected={folderSelected(folder, null)}
							onpress={() => void mailbox.openFolder(folder.folderId)}
						/>
					{/each}
				{/if}
			{/if}
		</View>
	</Scroll>

	<View style={{ borderTopWidth: 1, borderColor: theme.colors.line, padding: 8, gap: 4 }}>
		<View
			style={{
				direction: 'row',
				align: 'center',
				gap: 8,
				paddingX: 8,
				height: 40,
				radius: theme.radii.control,
				cursor: 'pointer'
			}}
			hover={{ background: theme.colors.hover }}
			onpress={openAccountMenu}
		>
			<Avatar name="" address={accountLabel()} size={24} />
			<Text
				style={{ flex: 1, minWidth: 0, truncate: true, fontSize: 12.5, color: theme.colors.text }}
				>{accountLabel()}</Text
			>
			<Icon svg={caretUpDownIcon} size={14} color={theme.colors.faint} />
		</View>
		<SyncFooter {accounts} />
	</View>
</View>
<ContextMenu bind:this={accountMenu} />
