<!-- A category as a small coloured pill. -->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import { labelColors, labelTitle } from '../../components/message-list/labels'

	let { label }: { label: string } = $props()

	const theme = $derived(currentTheme())
	const colors = $derived(labelColors(theme, label))
</script>

<View style={{ paddingX: 6, paddingY: 1, radius: 999, background: colors.background }}>
	<Text style={{ fontSize: 10.5, lineHeight: 14, fontWeight: 500, color: colors.color }}
		>{labelTitle(label)}</Text
	>
</View>
