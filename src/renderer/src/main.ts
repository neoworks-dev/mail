import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-mono/400.css'
import { mount } from 'svelte'
import App from './App.svelte'
import './assets/main.css'
// Applies the stored theme before first paint.
import './state/theme.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('missing #app mount point')

mount(App, { target })
