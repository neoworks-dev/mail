<!--
  Says what was kept out of a message: remote images held back until the user loads them, and
  the tracking pixels and click wrappers that were removed.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import shieldIcon from '@phosphor-icons/core/regular/shield-check.svg'
	import type { MailDocument } from '../../../shared/document'
	import { plural } from './format'

	let {
		document,
		imagesAllowed,
		onallow
	}: { document: MailDocument; imagesAllowed: boolean; onallow: () => void } = $props()

	const theme = $derived(currentTheme())
	const trackers = $derived(document.trackersRemoved + document.linksUnwrapped)
	const imagesBlocked = $derived(document.remoteImages > 0 && !imagesAllowed)

	const text = $derived.by(() => {
		const parts: string[] = []
		if (imagesBlocked) parts.push('Remote images blocked')
		if (trackers > 0) parts.push(`${plural(trackers, 'tracker')} removed`)
		return parts.join(' · ')
	})
</script>

{#if imagesBlocked || trackers > 0}
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
			}}>{text}</Text
		>
		{#if imagesBlocked}
			<Button variant="ghost" size="sm" onpress={onallow}><Text>Load images</Text></Button>
		{/if}
	</View>
{/if}
