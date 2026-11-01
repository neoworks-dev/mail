<!--
  An address field with suggestions from the synced mailbox. Suggestions apply to the term after
  the last comma, so lists of several recipients work.
-->
<script lang="ts">
	import { Input, Overlay, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { KeyEvent } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, glassPanelLook, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { Suggestion } from './recipients'
	import { applySuggestion, currentTerm } from './recipients'

	interface Props {
		value: string
		placeholder?: string
		suggest: (term: string) => Promise<Suggestion[]>
	}

	let { value = $bindable(), placeholder = '', suggest }: Props = $props()

	const DEBOUNCE_MS = 150
	const MINIMUM_TERM_LENGTH = 2

	const theme = $derived(currentTheme())
	let suggestions = $state<Suggestion[]>([])
	let selectedIndex = $state(0)
	let focused = $state(false)
	let timer: ReturnType<typeof setTimeout> | null = null

	const open = $derived(focused && suggestions.length > 0)

	function handleInput(): void {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => void fetchSuggestions(), DEBOUNCE_MS)
	}

	async function fetchSuggestions(): Promise<void> {
		const term = currentTerm(value)
		if (term.length < MINIMUM_TERM_LENGTH) {
			suggestions = []
			return
		}
		const results = await suggest(term)
		const existing = value.toLowerCase()
		suggestions = results.filter((entry) => !existing.includes(entry.address.toLowerCase()))
		selectedIndex = 0
	}

	function apply(suggestion: Suggestion): void {
		value = applySuggestion(value, suggestion)
		suggestions = []
	}

	function handleKey(event: KeyEvent): void {
		if (!open) return
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1)
			return
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault()
			selectedIndex = Math.max(selectedIndex - 1, 0)
			return
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault()
			event.stopPropagation()
			apply(suggestions[selectedIndex])
			return
		}
		if (event.key === 'Escape') {
			event.stopPropagation()
			suggestions = []
		}
	}

	function rowBackground(index: number): string {
		if (index === selectedIndex) return theme.colors.hover
		return 'transparent'
	}
</script>

<View style={{ flex: 1, minWidth: 0 }}>
	<Input
		bind:value
		{placeholder}
		style={{
			...typeStyle('bodySmall'),
			background: 'transparent',
			color: theme.colors.text,
			paddingY: 6
		}}
		oninput={handleInput}
		onkey={handleKey}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
	/>
	{#if open}
		<Overlay side="bottom" align="start" offset={4} matchWidth keepFocus>
			<View
				style={{
					...glassPanelLook(theme),
					padding: 6,
					gap: 2,
					borderWidth: 1,
					borderColor: theme.colors.line
				}}
			>
				{#each suggestions as suggestion, index (suggestion.address)}
					<View
						style={{
							direction: 'row',
							align: 'center',
							gap: 8,
							paddingX: 10,
							paddingY: 6,
							radius: theme.radii.control,
							background: rowBackground(index),
							cursor: 'pointer'
						}}
						onhover={(hovered) => hovered && (selectedIndex = index)}
						onpress={() => apply(suggestion)}
					>
						{#if suggestion.name !== ''}
							<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.text }}
								>{suggestion.name}</Text
							>
						{/if}
						<Text
							style={{
								...typeStyle('caption'),
								color: theme.colors.muted,
								flex: 1,
								minWidth: 0,
								truncate: true
							}}>{suggestion.address}</Text
						>
					</View>
				{/each}
			</View>
		</Overlay>
	{/if}
</View>
