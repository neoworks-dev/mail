<!--
  The input under the chat. Enter sends to the agent, Shift+Enter breaks the line, Escape gives
  the keyboard back to the mail. The prompt templates sit above it as chips.
-->
<script lang="ts">
	import { Input, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { KeyEvent } from '@neoworks/svelte-gpui/ui'
	import { Chip, currentTheme, IconButton, typeStyle } from '@neoworks/svelte-gpui-ui'
	import paperPlaneRight from '@phosphor-icons/core/regular/paper-plane-right.svg'
	import type { AssistantPrompt } from '../../../shared/assistant'
	import type { AssistantService } from '../assistant/service.svelte'

	let { assistant }: { assistant: AssistantService } = $props()

	const theme = $derived(currentTheme())
	const available = $derived(assistant.available)
	const prompts = $derived(assistant.state.prompts)

	let text = $state('')
	let sending = $state(false)
	let field: Input | undefined = $state()

	async function send(): Promise<void> {
		if (sending || text.trim() === '') return
		sending = true
		const sent = text
		text = ''
		await assistant.ask(sent)
		// A failed send keeps what was typed, so nothing is lost.
		if (assistant.state.error) text = sent
		sending = false
	}

	function key(event: KeyEvent): void {
		if (event.key === 'Enter' && !event.shift) {
			event.preventDefault()
			event.stopPropagation()
			void send()
			return
		}
		if (event.key === 'Escape') {
			event.stopPropagation()
			if (field) field.blur()
		}
	}

	function runPrompt(prompt: AssistantPrompt): void {
		void assistant.runPrompt(prompt, '')
	}

	function placeholder(): string {
		if (available) return 'Ask about your mail…'
		return 'The assistant is not connected'
	}
</script>

<View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderColor: theme.colors.line }}>
	{#if assistant.state.error}
		<Text style={{ ...typeStyle('caption'), color: theme.colors.danger }}
			>{assistant.state.error}</Text
		>
	{/if}
	{#if available && prompts.length > 0}
		<View style={{ direction: 'row', wrap: true, gap: 6 }}>
			{#each prompts as prompt (prompt.name)}
				<Chip variant="suggestion" label={prompt.name} onpress={() => runPrompt(prompt)} />
			{/each}
		</View>
	{/if}
	<View
		style={{
			direction: 'row',
			align: 'end',
			gap: 6,
			paddingLeft: 12,
			paddingRight: 4,
			paddingY: 4,
			radius: theme.radii.control,
			borderWidth: 1,
			borderColor: theme.colors.line,
			background: theme.colors.canvas
		}}
	>
		<Input
			bind:this={field}
			bind:value={text}
			multiline
			rows={2}
			disabled={!available}
			placeholder={placeholder()}
			onkey={key}
			style={{
				...typeStyle('bodySmall'),
				flex: 1,
				minWidth: 0,
				paddingY: 6,
				color: theme.colors.text,
				maxHeight: 160
			}}
		/>
		<IconButton
			icon={paperPlaneRight}
			label="Send"
			size="sm"
			variant="filled"
			disabled={!available || text.trim() === ''}
			onpress={() => void send()}
		/>
	</View>
</View>
