<!-- A sender as a circle with their initials, tinted by one of the theme's colour scales. -->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import { avatarInitials, avatarScale } from '../lib/avatar'

	interface Props {
		name: string
		address: string
		size?: number
		/** Layout only, such as margins. */
		style?: Style
	}

	let { name, address, size = 32, style }: Props = $props()

	const theme = $derived(currentTheme())
	const scale = $derived(theme.scales[avatarScale(address)])
</script>

<View
	style={{
		size,
		shrink: 0,
		radius: size / 2,
		align: 'center',
		justify: 'center',
		background: scale[4],
		...style
	}}
>
	<Text
		style={{
			fontFamily: 'sans',
			fontSize: Math.round(size * 0.38),
			fontWeight: 600,
			color: scale[11]
		}}>{avatarInitials(name, address)}</Text
	>
</View>
