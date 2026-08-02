// Light/dark theme via the ui package's [data-theme] tokens. Applied on
// module load (imported from main.ts) so the first paint has the right theme.

const THEME_KEY = 'neomail:theme'

export type Theme = 'dark' | 'light'

function storedTheme(): Theme {
	if (localStorage.getItem(THEME_KEY) === 'light') return 'light'
	return 'dark'
}

function applyTheme(theme: Theme): void {
	document.documentElement.dataset.theme = theme
}

class ThemeState {
	current = $state<Theme>(storedTheme())

	toggle(): void {
		if (this.current === 'dark') {
			this.current = 'light'
		} else {
			this.current = 'dark'
		}
		localStorage.setItem(THEME_KEY, this.current)
		applyTheme(this.current)
	}
}

export const themeState = new ThemeState()
applyTheme(themeState.current)
