<!--
  The folders column, after Notion Mail: the account switcher with the compose button beside it,
  the `sidebar.top` slot (search), all inboxes (with more than one account), the inbox, its
  categories, the other well-known folders, the rest behind a "Folders" disclosure, how sync and
  the search index are doing, and the `sidebar.footer` slot (theme and assistant).
-->
<script lang="ts">
	import { ContextMenu, Icon, Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { MenuItem, PointerEvent } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, IconButton, typeStyle } from '@neoworks/svelte-gpui-ui'
	import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
	import caretRightIcon from '@phosphor-icons/core/regular/caret-right.svg'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import caretUpDownIcon from '@phosphor-icons/core/regular/caret-up-down.svg'
	import folderIcon from '@phosphor-icons/core/regular/folder.svg'
	import notePencilIcon from '@phosphor-icons/core/regular/note-pencil.svg'
	import paperPlaneIcon from '@phosphor-icons/core/regular/paper-plane-tilt.svg'
	import plusIcon from '@phosphor-icons/core/regular/plus.svg'
	import stackIcon from '@phosphor-icons/core/fill/stack-simple-fill.svg'
	import inboxIcon from '@phosphor-icons/core/fill/tray-fill.svg'
	import trashIcon from '@phosphor-icons/core/regular/trash.svg'
	import trayIcon from '@phosphor-icons/core/regular/tray.svg'
	import warningIcon from '@phosphor-icons/core/regular/warning.svg'
	import { ALL_MAIL_LABELS, type MailFolder } from '../../../shared/mail'
	import { labelIcon, labelIconColor, labelTitle } from '../../components/message-list/labels'
	import Avatar from '../../components/Avatar.svelte'
	import type { CommandsService } from '../../kernel/commands'
	import type { SettingsService } from '../../kernel/settings/service'
	import type { AccountsService } from '../accounts/service.svelte'
	import type { MailboxService } from '../mailbox/service.svelte'
	import {
		folderDisplayName,
		otherFolders,
		primaryFolders,
		SPECIAL_NAMES,
		type PrimaryFolder,
		type SpecialKind
	} from './folders'
	import Slot from '../../kernel/slots/Slot.svelte'
	import SectionLabel from './SectionLabel.svelte'
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
	const inboxes = $derived(primary.filter((entry) => entry.kind === 'inbox'))
	const otherPrimary = $derived(primary.filter((entry) => entry.kind !== 'inbox'))
	const foldersOpen = $derived(settings.get(FOLDERS_OPEN_SETTING, false))
	const multipleAccounts = $derived(accounts.state.accounts.length > 1)

	let accountMenu: ContextMenu | undefined = $state()

	function categoryTitle(label: string | null): string {
		if (label === null) return 'All'
		return labelTitle(label)
	}

	function categoryIcon(label: string | null): string {
		if (label === null) return inboxIcon
		return labelIcon(label)
	}

	function categoryColor(label: string | null): string {
		if (label === null) return theme.scales.lake[9]
		return labelIconColor(theme, label)
	}

	function categoryCount(counts: Record<string, number>, label: string | null): number {
		if (label === null) return counts['__all'] || 0
		return counts[label] || 0
	}

	/** Unread mail, except drafts, which have nothing to read and count what is waiting. */
	function primaryCount(entry: PrimaryFolder): number {
		if (entry.kind === 'drafts') return entry.folder.totalMessages
		return entry.folder.unreadMessages
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

<View style={{ width: 232, background: theme.colors.canvas }}>
	<View style={{ direction: 'row', align: 'center', gap: 4, paddingLeft: 8, paddingRight: 6 }}>
		<View
			style={{
				flex: 1,
				minWidth: 0,
				direction: 'row',
				align: 'center',
				gap: 8,
				paddingX: 6,
				height: 36,
				radius: theme.radii.control,
				cursor: 'pointer'
			}}
			hover={{ background: theme.colors.hover }}
			onpress={openAccountMenu}
		>
			<Avatar name="" address={accountLabel()} size={24} />
			<Text
				style={{
					...typeStyle('nav'),
					fontWeight: 500,
					color: theme.colors.text,
					flex: 1,
					minWidth: 0,
					truncate: true
				}}>{accountLabel()}</Text
			>
			<Icon svg={caretUpDownIcon} size={12} color={theme.colors.faint} />
		</View>
		<IconButton
			icon={notePencilIcon}
			label="New message (c)"
			size="sm"
			onpress={() => void commands.run('compose.new')}
		/>
	</View>
	<View style={{ paddingX: 8, paddingTop: 2, gap: 1 }}>
		<Slot name="sidebar.top" />
	</View>
	<Scroll style={{ flex: 1 }}>
		<View style={{ paddingX: 8, paddingTop: 6, paddingBottom: 8, gap: 1 }}>
			{#if multipleAccounts}
				<SidebarRow
					title="All inboxes"
					icon={stackIcon}
					iconColor={theme.scales.lake[9]}
					selected={unifiedSelected(null)}
					onpress={() => void mailbox.openUnified()}
				/>
				{#each CATEGORIES.slice(1) as label (label)}
					<SidebarRow
						title={categoryTitle(label)}
						icon={categoryIcon(label)}
						iconColor={categoryColor(label)}
						indented
						count={categoryCount(accounts.state.unifiedLabelCounts, label)}
						selected={unifiedSelected(label)}
						onpress={() => void mailbox.openUnified(label)}
					/>
				{/each}
				<SectionLabel title={accountLabel()} />
			{/if}

			{#each inboxes as entry (entry.folder.folderId)}
				<SidebarRow
					title={folderDisplayName(entry.folder)}
					icon={inboxIcon}
					iconColor={categoryColor(null)}
					count={entry.folder.unreadMessages}
					selected={folderSelected(entry.folder, null)}
					onpress={() => void mailbox.openFolder(entry.folder.folderId)}
				/>
			{/each}

			{#each inboxes as entry (entry.folder.folderId)}
				<SectionLabel title="Categories" />
				{#each CATEGORIES.slice(1) as label (label)}
					<SidebarRow
						title={categoryTitle(label)}
						icon={categoryIcon(label)}
						iconColor={categoryColor(label)}
						count={categoryCount(accounts.state.inboxLabelCounts, label)}
						selected={folderSelected(entry.folder, label)}
						onpress={() => void mailbox.openFolder(entry.folder.folderId, label)}
					/>
				{/each}
			{/each}

			{#if otherPrimary.length > 0 || others.length > 0}
				<SectionLabel title="Mail" />
			{/if}
			{#each otherPrimary as entry (entry.folder.folderId)}
				<SidebarRow
					title={SPECIAL_NAMES[entry.kind]}
					icon={SPECIAL_ICONS[entry.kind]}
					count={primaryCount(entry)}
					selected={folderSelected(entry.folder, null)}
					onpress={() => void mailbox.openFolder(entry.folder.folderId)}
				/>
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

	<View style={{ paddingX: 8, paddingTop: 6, paddingBottom: 8, gap: 6 }}>
		<SyncFooter {accounts} />
		<View style={{ direction: 'row', align: 'center', gap: 2 }}>
			<Slot name="sidebar.footer" />
		</View>
	</View>
</View>
<ContextMenu bind:this={accountMenu} />
