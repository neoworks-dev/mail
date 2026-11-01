// Shared measures of the frame, for the plugins that draw into it.

import type { Style } from '@neoworks/svelte-gpui/ui'
import type { Theme } from '@neoworks/svelte-gpui-ui'

export const NAVIGATION_WIDTH = { initial: 600, minimum: 420, maximum: 900 }

/** A floating surface on the canvas: the look of every pane. */
export function surfaceStyle(theme: Theme): Style {
	return {
		background: theme.colors.surface,
		borderWidth: 1,
		borderColor: theme.colors.line,
		radius: theme.radii.card,
		overflow: 'hidden'
	}
}
