<script lang="ts">
	// Address input with autocomplete from the synced mailbox. Suggestions
	// apply to the term after the last comma, so multi-recipient lists work.

	interface Suggestion {
		address: string
		name: string
	}

	interface Props {
		value: string
		accountId: number
		placeholder?: string
		required?: boolean
	}

	let { value = $bindable(), accountId, placeholder = '', required = false }: Props = $props()

	const DEBOUNCE_MS = 150

	let suggestions = $state<Suggestion[]>([])
	let selectedIndex = $state(0)
	let focused = $state(false)
	let timer: ReturnType<typeof setTimeout> | null = null

	const open = $derived(focused && suggestions.length > 0)

	function currentTerm(): string {
		const lastComma = value.lastIndexOf(',')
		return value.slice(lastComma + 1).trim()
	}

	function onInput(): void {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => {
			void fetchSuggestions()
		}, DEBOUNCE_MS)
	}

	async function fetchSuggestions(): Promise<void> {
		const term = currentTerm()
		if (term.length < 2) {
			suggestions = []
			return
		}
		const results = await window.neomail.contacts.suggest(accountId, term)
		// Skip addresses already present in the field.
		const existing = value.toLowerCase()
		suggestions = results.filter((entry) => !existing.includes(entry.address.toLowerCase()))
		selectedIndex = 0
	}

	function apply(suggestion: Suggestion): void {
		const lastComma = value.lastIndexOf(',')
		const kept = lastComma === -1 ? '' : `${value.slice(0, lastComma + 1)} `
		value = `${kept}${suggestion.address}, `
		suggestions = []
	}

	function onKeydown(event: KeyboardEvent): void {
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
			apply(suggestions[selectedIndex])
			return
		}
		if (event.key === 'Escape') {
			suggestions = []
		}
	}
</script>

<div class="relative w-full">
	<input
		type="text"
		bind:value
		{placeholder}
		{required}
		oninput={onInput}
		onkeydown={onKeydown}
		onfocus={() => (focused = true)}
		onblur={() => setTimeout(() => (focused = false), 150)}
		class="w-full bg-transparent py-1 text-sm outline-none"
	/>
	{#if open}
		<div
			class="border-line bg-raised absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border shadow-lg"
		>
			{#each suggestions as suggestion, index (suggestion.address)}
				<button
					type="button"
					class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm
						{index === selectedIndex ? 'bg-hover' : 'hover:bg-hover'}"
					onmouseenter={() => (selectedIndex = index)}
					onclick={() => apply(suggestion)}
				>
					{#if suggestion.name !== ''}
						<span class="shrink-0">{suggestion.name}</span>
					{/if}
					<span class="text-muted min-w-0 truncate text-xs">{suggestion.address}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
