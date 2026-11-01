<!--
  The overlays of the account commands: adding another account, and removing the selected one
  after asking.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, Dialog, Divider, IconButton, typeStyle } from '@neoworks/svelte-gpui-ui'
	import closeIcon from '@phosphor-icons/core/regular/x.svg'
	import warningIcon from '@phosphor-icons/core/regular/warning.svg'
	import ModalScrim from '../../components/modal/ModalScrim.svelte'
	import AccountForm from './AccountForm.svelte'
	import type { AccountActions } from './actions'
	import type { AccountDialogState } from './state.svelte'

	let { dialogs, accountActions }: { dialogs: AccountDialogState; accountActions: AccountActions } =
		$props()

	let removing = $state(false)

	function removalTitle(): string {
		const email = accountActions.selectedEmail()
		if (email === null) return 'Remove this account?'
		return `Remove ${email}?`
	}

	async function remove(): Promise<void> {
		removing = true
		try {
			await accountActions.removeSelected()
		} finally {
			removing = false
			dialogs.removing = false
		}
	}
</script>

{#if dialogs.adding}
	<ModalScrim
		onclose={() => (dialogs.adding = false)}
		panelStyle={{ width: 480, maxWidth: '100%', maxHeight: '92%' }}
	>
		<View
			style={{ direction: 'row', align: 'center', paddingLeft: 24, paddingRight: 8, paddingY: 8 }}
		>
			<Text style={{ ...typeStyle('title'), flex: 1 }}>Add a mail account</Text>
			<IconButton icon={closeIcon} label="Close" onpress={() => (dialogs.adding = false)} />
		</View>
		<Divider />
		<View style={{ padding: 24 }}>
			<AccountForm actions={accountActions} ondone={() => (dialogs.adding = false)} />
		</View>
	</ModalScrim>
{/if}

<Dialog bind:open={dialogs.removing} title={removalTitle()} icon={warningIcon}>
	<Text>Its mail is removed from this computer. The mailbox on the server stays as it is.</Text>
	{#snippet actions()}
		<Button variant="ghost" onpress={() => (dialogs.removing = false)}><Text>Cancel</Text></Button>
		<Button variant="danger" disabled={removing} onpress={() => void remove()}
			><Text>Remove account</Text></Button
		>
	{/snippet}
</Dialog>
