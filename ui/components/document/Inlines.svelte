<!--
  One paragraph of runs. With links in it the paragraph takes presses: one link opens, several
  ask which.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import type { PointerEvent, Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import type { Inline, TextRun } from '../../../shared/document'
	import { linksIn, useDocumentContext } from './context'

	let { inlines, style }: { inlines: Inline[]; style: Style } = $props()

	const document = useDocumentContext()
	const theme = $derived(currentTheme())
	const links = $derived(linksIn(inlines))

	function runStyle(run: TextRun): Style {
		const runLook: Style = {}
		if (run.bold) runLook.fontWeight = 'bold'
		if (run.italic) runLook.italic = true
		if (run.underline) runLook.underline = true
		if (run.strike) runLook.strikethrough = true
		if (run.code) {
			runLook.fontFamily = 'mono'
			runLook.background = theme.colors.sunken
		}
		if (run.href) {
			runLook.color = theme.colors.accent
			runLook.underline = true
		}
		return runLook
	}

	function press(event: PointerEvent): void {
		if (links.length === 1) {
			document.openLink(links[0].href)
			return
		}
		document.chooseLink(links, event.windowX, event.windowY)
	}
</script>

{#snippet paragraph()}
	<Text {style}>
		{#each inlines as inline, index (index)}
			{#if inline.kind === 'break'}
				<Text>{'\n'}</Text>
			{:else}
				<Text style={runStyle(inline)}>{inline.text}</Text>
			{/if}
		{/each}
	</Text>
{/snippet}

{#if links.length > 0}
	<View style={{ cursor: 'pointer', minWidth: 0 }} onpress={press}>
		{@render paragraph()}
	</View>
{:else}
	{@render paragraph()}
{/if}
