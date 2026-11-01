<!-- A person as a quiet grey circle with their initials, as the NeoWorks website draws its account. -->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import { avatarInitials } from '../lib/avatar'

	interface Props {
		name: string
		address: string
		size?: number
		/** Layout only, such as margins. */
		style?: Style
	}

	let { name, address, size = 32, style }: Props = $props()

	const theme = $derived(currentTheme())
</script>

<View
	style={{
		size,
		shrink: 0,
		radius: size / 2,
		align: 'center',
		justify: 'center',
		background: theme.colors.pressed,
		...style
	}}
>
	<Text
		style={{
			fontFamily: 'sans',
			fontSize: Math.round(size * 0.36),
			fontWeight: 500,
			color: theme.colors.text
		}}>{avatarInitials(name, address)}</Text
	>
</View>
