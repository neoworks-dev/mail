// The light or dark theme of the design system, dark unless the user switched it. The choice is
// kept in settings and applied as soon as they load, before the frame draws.

import type { Context } from '@neoworks/extension-system'
import { setThemeMode, themeMode, toggleThemeMode, type ThemeMode } from '@neoworks/svelte-gpui-ui'

const THEME_SETTING = 'theme.mode'

export const theme = {
	name: 'theme',
	inject: ['settings', 'commands'],
	apply(ctx: Context) {
		setThemeMode(ctx.settings.get<ThemeMode>(THEME_SETTING, 'dark'))
		ctx.commands.register({
			id: 'theme.toggle',
			title: 'Toggle light and dark theme',
			group: 'View',
			run: () => {
				toggleThemeMode()
				ctx.settings.set(THEME_SETTING, themeMode())
			}
		})
	}
}
