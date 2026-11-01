export interface AccountDialogState {
	adding: boolean
	removing: boolean
}

export function createAccountDialogState(): AccountDialogState {
	const state: AccountDialogState = $state({ adding: false, removing: false })
	return state
}
