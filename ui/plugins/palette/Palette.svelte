<!--
  The command bar: text searches the mailbox, full-text or by meaning (Alt+S), and a leading `>`
  lists commands. Up and Down move the highlight, Enter runs or opens it.
-->
<script lang="ts">
	import { untrack } from 'svelte'
	import { Icon, Input, Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { KeyEvent } from '@neoworks/svelte-gpui/ui'
	import { Chip, Divider, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import searchIcon from '@phosphor-icons/core/regular/magnifying-glass.svg'
	import commandIcon from '@phosphor-icons/core/regular/command.svg'
	import type { SearchResult } from '../../../shared/mail'
	import ModalScrim from '../../components/modal/ModalScrim.svelte'
	import { filterCommands, type PaletteCommand } from '../../lib/palette'
	import { snippetParts } from './snippet'
	import { closePalette, type PaletteState } from './state.svelte'

	interface Props {
		palette: PaletteState
		commands: () => PaletteCommand[]
		search: (term: string, semantic: boolean) => Promise<SearchResult[]>
		openResult: (result: SearchResult) => void
	}

	let { palette, commands, search, openResult }: Props = $props()

	const SEARCH_DEBOUNCE_MS = 200
	const COMMAND_ROW_HEIGHT = 40
	const RESULT_ROW_HEIGHT = 72
	const LIST_HEIGHT = 420

	const theme = $derived(currentTheme())
	let query = $state('')
	let selectedIndex = $state(0)
	let semantic = $state(false)
	let results = $state<SearchResult[]>([])
	let searching = $state(false)
	let searchError = $state<string | null>(null)
	let field: Input | undefined = $state()
	let scroller: Scroll | undefined = $state()

	const commandMode = $derived(query.startsWith('>'))
	const searchTerm = $derived.by(() => {
		if (commandMode) return ''
		return query.trim()
	})
	const listingCommands = $derived(commandMode || searchTerm === '')
	const shownCommands = $derived.by(() => {
		if (!palette.open || !listingCommands) return []
		let filter = ''
		if (commandMode) filter = query.slice(1)
		return filterCommands(commands(), filter)
	})
	const rowCount = $derived.by(() => {
		if (listingCommands) return shownCommands.length
		return results.length
	})

	// Each opening starts from the prefill with the field focused.
	$effect(() => {
		if (!palette.open) return
		const opening = palette.openings
		untrack(() => {
			query = palette.prefill
			selectedIndex = 0
			results = []
			searchError = null
		})
		queueMicrotask(() => {
			if (opening === palette.openings && field) field.focus()
		})
	})

	$effect(() => {
		const term = searchTerm
		const bySense = semantic
		if (term === '' || !palette.open) {
			results = []
			searching = false
			return
		}
		searching = true
		const timer = setTimeout(() => void runSearch(term, bySense), SEARCH_DEBOUNCE_MS)
		return () => clearTimeout(timer)
	})

	$effect(() => {
		if (selectedIndex >= rowCount) selectedIndex = 0
	})

	async function runSearch(term: string, bySense: boolean): Promise<void> {
		try {
			searchError = null
			const found = await search(term, bySense)
			// A newer query replaced this one while it ran.
			if (term !== searchTerm || bySense !== semantic) return
			results = found
			selectedIndex = 0
		} catch (error) {
			searchError = error instanceof Error ? error.message : String(error)
			results = []
		} finally {
			if (term === searchTerm) searching = false
		}
	}

	function close(): void {
		closePalette(palette)
	}

	function runCommand(command: PaletteCommand): void {
		close()
		command.run()
	}

	function open(result: SearchResult): void {
		close()
		openResult(result)
	}

	function activate(): void {
		if (listingCommands) {
			const command = shownCommands[selectedIndex]
			if (command) runCommand(command)
			return
		}
		const result = results[selectedIndex]
		if (result) open(result)
	}

	function moveSelection(step: number): void {
		const next = selectedIndex + step
		if (next < 0 || next >= rowCount) return
		selectedIndex = next
		keepVisible(next)
	}

	/** Scrolls the list so the highlighted row is inside it. */
	function keepVisible(index: number): void {
		if (!scroller) return
		let rowHeight = RESULT_ROW_HEIGHT
		if (listingCommands) rowHeight = COMMAND_ROW_HEIGHT
		const top = index * rowHeight
		const scrolled = scroller.position().y
		if (top < scrolled) scroller.scrollTo(top)
		if (top + rowHeight > scrolled + LIST_HEIGHT) scroller.scrollTo(top + rowHeight - LIST_HEIGHT)
	}

	function handleKey(event: KeyEvent): void {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault()
			event.stopPropagation()
			let step = 1
			if (event.key === 'ArrowUp') step = -1
			moveSelection(step)
			return
		}
		if (event.key === 'Enter') {
			event.preventDefault()
			event.stopPropagation()
			activate()
			return
		}
		if (event.key.toLowerCase() === 's' && event.alt) {
			event.preventDefault()
			event.stopPropagation()
			semantic = !semantic
		}
	}

	function rowBackground(index: number): string {
		if (index === selectedIndex) return theme.colors.hover
		return 'transparent'
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
	}

	function senderOf(result: SearchResult): string {
		if (result.fromName !== '') return result.fromName
		return result.fromAddress
	}

	function subjectOf(result: SearchResult): string {
		if (result.subject !== '') return result.subject
		return '(no subject)'
	}

	function emptyText(): string | null {
		if (listingCommands) {
			if (shownCommands.length === 0) return 'No matching commands'
			return null
		}
		if (searchError !== null) return searchError
		if (results.length > 0) return null
		if (searching) return 'Searching…'
		return 'No messages found'
	}

	function fieldIcon(): string {
		if (commandMode) return commandIcon
		return searchIcon
	}
</script>

{#if palette.open}
	<ModalScrim onclose={close} placement="top" panelStyle={{ width: 640, maxWidth: '100%' }}>
		<View style={{ direction: 'row', align: 'center', gap: 10, paddingX: 16, minHeight: 52 }}>
			<Icon svg={fieldIcon()} size={18} color={theme.colors.muted} />
			<Input
				bind:this={field}
				bind:value={query}
				placeholder="Search mail… ('>' for commands)"
				style={{
					...typeStyle('body'),
					flex: 1,
					minWidth: 0,
					background: 'transparent',
					color: theme.colors.text,
					paddingY: 12
				}}
				onkey={handleKey}
			/>
			{#if !commandMode}
				<Chip
					variant="filter"
					label="Semantic"
					selected={semantic}
					onpress={() => (semantic = !semantic)}
				/>
			{/if}
		</View>
		<Divider />
		<Scroll bind:this={scroller} style={{ maxHeight: LIST_HEIGHT }}>
			<View style={{ padding: 6 }}>
				{#if emptyText() !== null}
					<Text
						style={{
							...typeStyle('bodySmall'),
							color: theme.colors.faint,
							paddingX: 12,
							paddingY: 10
						}}>{emptyText()}</Text
					>
				{/if}
				{#if listingCommands}
					{#each shownCommands as command, index (command.id)}
						<View
							style={{
								direction: 'row',
								align: 'center',
								height: COMMAND_ROW_HEIGHT,
								paddingX: 12,
								gap: 12,
								radius: theme.radii.control,
								background: rowBackground(index),
								cursor: 'pointer'
							}}
							onhover={(hovered) => hovered && (selectedIndex = index)}
							onpress={() => runCommand(command)}
						>
							<Text style={{ ...typeStyle('bodySmall'), flex: 1, minWidth: 0, truncate: true }}
								>{command.label}</Text
							>
							{#if command.shortcut}
								<Text
									style={{
										...typeStyle('caption'),
										color: theme.colors.faint,
										borderWidth: 1,
										borderColor: theme.colors.line,
										radius: 4,
										paddingX: 6,
										paddingY: 1
									}}>{command.shortcut}</Text
								>
							{/if}
						</View>
					{/each}
				{:else}
					{#each results as result, index (result.messageId)}
						<View
							style={{
								height: RESULT_ROW_HEIGHT,
								paddingX: 12,
								justify: 'center',
								gap: 2,
								radius: theme.radii.control,
								background: rowBackground(index),
								cursor: 'pointer'
							}}
							onhover={(hovered) => hovered && (selectedIndex = index)}
							onpress={() => open(result)}
						>
							<View style={{ direction: 'row', align: 'baseline', gap: 8 }}>
								<Text
									style={{
										...typeStyle('bodySmall'),
										fontWeight: 600,
										flex: 1,
										minWidth: 0,
										truncate: true
									}}>{senderOf(result)}</Text
								>
								<Text style={{ ...typeStyle('caption'), color: theme.colors.faint }}
									>{result.folderPath} · {formatDate(result.date)}</Text
								>
							</View>
							<Text style={{ ...typeStyle('bodySmall'), truncate: true }}>{subjectOf(result)}</Text>
							<Text style={{ ...typeStyle('caption'), color: theme.colors.muted, truncate: true }}>
								{#each snippetParts(result.matchSnippet) as part, partIndex (partIndex)}
									{#if part.hit}<Text style={{ fontWeight: 600, color: theme.colors.text }}
											>{part.text}</Text
										>{:else}<Text>{part.text}</Text>{/if}
								{/each}
							</Text>
						</View>
					{/each}
				{/if}
			</View>
		</Scroll>
		<Divider />
		<Text style={{ ...typeStyle('caption'), color: theme.colors.faint, paddingX: 16, paddingY: 8 }}>
			Type to search · ">" commands · Alt+S semantic · Enter opens
		</Text>
	</ModalScrim>
{/if}
