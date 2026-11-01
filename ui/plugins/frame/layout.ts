// Shared measures of the frame, for the plugins that draw into it.

import type { Style } from '@neoworks/svelte-gpui/ui'
import type { Theme } from '@neoworks/svelte-gpui-ui'

/** Whether the reading area takes the whole window while a thread is open. */
export const READER_FOCUSED_SETTING = 'frame.readerFocused'

export const NAVIGATION_WIDTH = { initial: 600, minimum: 420, maximum: 900 }

/** A pane that runs to the window's edges and meets its neighbours at a hairline. */
export function paneStyle(theme: Theme): Style {
	return {
		background: theme.colors.surface,
		overflow: 'hidden'
	}
}
