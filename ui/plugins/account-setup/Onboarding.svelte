<!--
  The whole window before any account exists: a welcome and the form to add the first one.
-->
<script lang="ts">
	import { Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, surfacePanelLook, typeStyle } from '@neoworks/svelte-gpui-ui'
	import AccountForm from './AccountForm.svelte'
	import type { AccountActions } from './actions'

	let { actions }: { actions: AccountActions } = $props()

	const theme = $derived(currentTheme())
</script>

<Scroll style={{ flex: 1 }}>
	<View style={{ align: 'center', paddingY: 64, paddingX: 24 }}>
		<View style={{ width: 460, maxWidth: '100%', gap: 24 }}>
			<View style={{ gap: 8 }}>
				<Text style={{ ...typeStyle('label'), uppercase: true, color: theme.colors.muted }}
					>Mail</Text
				>
				<Text style={typeStyle('heading')}>Add a mail account</Text>
			</View>
			<View
				style={{
					...surfacePanelLook(theme),
					padding: 24,
					radius: theme.radii.card,
					borderWidth: 1,
					borderColor: theme.colors.line
				}}
			>
				<AccountForm {actions} />
			</View>
		</View>
	</View>
</Scroll>
