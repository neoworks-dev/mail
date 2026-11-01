<!--
  Draws a message body, or an assistant message, from its blocks (shared/document.ts). Runs
  inside a paragraph cannot be pressed, so a paragraph with links is pressable as a whole: one
  link opens directly, several open a menu at the pointer listing them.
-->
<script lang="ts">
	import { ContextMenu, View } from '@neoworks/svelte-gpui/ui'
	import type { Block } from '../../../shared/document'
	import BlockView from './BlockView.svelte'
	import { setDocumentContext } from './context'

	interface Props {
		blocks: Block[]
		/** Opens a link the user pressed. */
		onopenlink: (href: string) => void
		/** Smaller type and tighter spacing, for the assistant pane. */
		dense?: boolean
	}

	let { blocks, onopenlink, dense = false }: Props = $props()

	let linkMenu: ContextMenu | undefined = $state()

	setDocumentContext({
		get dense() {
			return dense
		},
		openLink: (href) => onopenlink(href),
		chooseLink: (links, x, y) => {
			if (!linkMenu) return
			const items = links.map((link) => ({
				label: link.label,
				onselect: () => onopenlink(link.href)
			}))
			linkMenu.openAt(x, y, items)
		}
	})
</script>

<View style={{ gap: dense ? 8 : 12, minWidth: 0 }}>
	{#each blocks as block, index (index)}
		<BlockView {block} />
	{/each}
</View>
<ContextMenu bind:this={linkMenu} />
