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
	const lines = $derived(splitLines(inlines))

	/** The runs between line breaks: text without `pre` collapses a newline, so each line is its own paragraph. */
	function splitLines(all: Inline[]): TextRun[][] {
		const result: TextRun[][] = [[]]
		for (const inline of all) {
			if (inline.kind === 'break') {
				result.push([])
				continue
			}
			result[result.length - 1].push(inline)
		}
		return result
	}

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

{#snippet line(runs: TextRun[])}
	<Text {style}>
		{#each runs as run, index (index)}
			<Text style={runStyle(run)}>{run.text}</Text>
		{/each}
		{#if runs.length === 0}
			<Text>{' '}</Text>
		{/if}
	</Text>
{/snippet}

{#snippet paragraph()}
	{#if lines.length === 1}
		{@render line(lines[0])}
	{:else}
		<View style={{ minWidth: 0 }}>
			{#each lines as runs, index (index)}
				{@render line(runs)}
			{/each}
		</View>
	{/if}
{/snippet}

{#if links.length > 0}
	<View style={{ cursor: 'pointer', minWidth: 0 }} onpress={press}>
		{@render paragraph()}
	</View>
{:else}
	{@render paragraph()}
{/if}
