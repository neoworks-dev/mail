<script lang="ts">
	import { Button } from '@neoworks-dev/ui'
	import { keybindings } from '../state/keybindings.svelte'
	import { comboFromEvent, comboLabel } from '../state/keycombo'
	import { mailState } from '../state/mail.svelte'

	let capturingId = $state<string | null>(null)

	$effect(() => {
		keybindings.captureActive = capturingId !== null
	})

	const rows = $derived.by(() => {
		// Touch overrides so the list re-derives after a rebind.
		void keybindings.overrides
		return keybindings.list()
	})

	function close(): void {
		capturingId = null
		mailState.keybindingSettingsOpen = false
	}

	function onCaptureKeydown(event: KeyboardEvent): void {
		if (capturingId === null) return
		event.preventDefault()
		event.stopPropagation()
		if (event.key === 'Escape') {
			capturingId = null
			return
		}
		// Wait for a real key, not a bare modifier press.
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
		keybindings.setOverride(capturingId, comboFromEvent(event))
		capturingId = null
	}
</script>

<svelte:window onkeydown={onCaptureKeydown} />

{#if mailState.keybindingSettingsOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onclick={close}>
		<div
			class="bg-canvas border-line flex max-h-[80vh] w-[480px] max-w-[90vw] flex-col overflow-hidden rounded-xl border shadow-lg"
			onclick={(event) => event.stopPropagation()}
		>
			<header class="border-line flex items-center justify-between border-b px-4 py-2.5">
				<h2 class="text-sm font-semibold">Keyboard shortcuts</h2>
				<button class="text-faint hover:text-default text-sm" onclick={close}>✕</button>
			</header>
			<div class="flex-1 overflow-y-auto p-2">
				{#each rows as row (row.def.id)}
					<div class="hover:bg-elevated flex items-center gap-2 rounded-lg px-2 py-1.5">
						<span class="min-w-0 flex-1 truncate text-sm">{row.def.title}</span>
						{#if row.overridden}
							<button
								class="text-faint text-xs hover:underline"
								onclick={() => keybindings.resetOverride(row.def.id)}
							>
								Reset
							</button>
						{/if}
						<button
							class="border-line hover:border-line-strong min-w-16 rounded border px-2 py-0.5 text-center text-xs
								{capturingId === row.def.id ? 'border-line-strong text-default' : 'text-muted'}"
							title="Click, then press the new shortcut"
							onclick={() => (capturingId = capturingId === row.def.id ? null : row.def.id)}
						>
							{capturingId === row.def.id ? 'Press keys…' : comboLabel(row.combo)}
						</button>
					</div>
				{/each}
			</div>
			<footer class="border-line-faint text-faint border-t px-4 py-2 text-xs">
				Click a shortcut, press the new combination. Escape cancels.
			</footer>
			<div class="border-line-faint flex justify-end border-t px-4 py-2">
				<Button size="sm" onclick={close}>Done</Button>
			</div>
		</div>
	</div>
{/if}
