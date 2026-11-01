<!--
  Says when a message's remote images are held back, with a button that loads them. Removed
  trackers go unmentioned.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import shieldIcon from '@phosphor-icons/core/regular/shield-check.svg'
	import type { MailDocument } from '../../../shared/document'

	let {
		document,
		imagesAllowed,
		onallow
	}: { document: MailDocument; imagesAllowed: boolean; onallow: () => void } = $props()

	const theme = $derived(currentTheme())
	const imagesBlocked = $derived(document.remoteImages > 0 && !imagesAllowed)
</script>

{#if imagesBlocked}
	<View
		style={{
			direction: 'row',
			align: 'center',
			gap: 8,
			marginX: 20,
			marginTop: 4,
			paddingLeft: 12,
			paddingRight: 6,
			paddingY: 4,
			radius: theme.radii.control,
			background: theme.colors.sunken,
			color: theme.colors.muted
		}}
	>
		<Icon svg={shieldIcon} size={14} />
		<Text
			style={{
				...typeStyle('caption'),
				color: theme.colors.muted,
				flex: 1,
				minWidth: 0,
				truncate: true
			}}>Remote images blocked</Text
		>
		<Button variant="ghost" size="sm" onpress={onallow}><Text>Load images</Text></Button>
	</View>
{/if}
