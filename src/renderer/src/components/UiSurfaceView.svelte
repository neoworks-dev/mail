<script lang="ts">
	// Renders an extension-published ui.surface node tree. Unknown kinds fall
	// back to fallbackText, which is how nib's vocabulary can grow without
	// breaking this client.
	import Self from './UiSurfaceView.svelte'
	import { renderMarkdown } from '../nib/markdown'
	import type { UiNode, UiTone } from '../nib/types'

	interface Props {
		node: UiNode
	}

	let { node }: Props = $props()

	// Future node kinds narrow to `never` in the template chain; read the
	// fallback through a widened parameter instead.
	function fallbackText(value: { fallbackText?: string }): string {
		if (value.fallbackText) return value.fallbackText
		return ''
	}

	function toneClass(tone: UiTone | undefined): string {
		if (tone === 'muted') return 'text-muted'
		if (tone === 'success') return 'text-green'
		if (tone === 'warning') return 'text-amber'
		if (tone === 'danger') return 'text-red'
		return ''
	}
</script>

{#if node.kind === 'stack'}
	<div class="flex flex-col gap-2">
		{#each node.children as child, index (index)}
			<Self node={child} />
		{/each}
	</div>
{:else if node.kind === 'text'}
	<p class="text-sm whitespace-pre-wrap {toneClass(node.tone)}">{node.text}</p>
{:else if node.kind === 'markdown'}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by renderMarkdown -->
	<div class="prose prose-sm max-w-none text-sm">{@html renderMarkdown(node.text)}</div>
{:else if node.kind === 'code'}
	<pre class="bg-canvas overflow-x-auto rounded-lg p-2 font-mono text-xs">{node.text}</pre>
{:else if node.kind === 'list'}
	<ul class="list-disc pl-5 text-sm">
		{#each node.items as item, index (index)}
			<li>{item}</li>
		{/each}
	</ul>
{:else if node.kind === 'keyValue'}
	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
		{#each node.entries as entry (entry.key)}
			<dt class="text-muted">{entry.key}</dt>
			<dd class="min-w-0 truncate">{entry.value}</dd>
		{/each}
	</dl>
{:else if node.kind === 'table'}
	<div class="overflow-x-auto">
		<table class="w-full text-left text-xs">
			<thead>
				<tr>
					{#each node.columns as column (column)}
						<th class="text-muted border-line-faint border-b px-2 py-1 font-medium">{column}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each node.rows as row, rowIndex (rowIndex)}
					<tr>
						{#each row as cell, cellIndex (cellIndex)}
							<td class="border-line-faint border-b px-2 py-1">{cell}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if node.kind === 'badge'}
	<span class="border-line inline-block rounded-full border px-2 py-0.5 text-xs {toneClass(node.tone)}">
		{node.text}
	</span>
{:else if node.kind === 'divider'}
	<hr class="border-line-faint" />
{:else if fallbackText(node) !== ''}
	<p class="text-muted text-sm">{fallbackText(node)}</p>
{/if}
