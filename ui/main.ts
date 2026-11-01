// The window's entry. The library must be imported before anything that pulls in Svelte's
// client runtime: it installs the DOM globals that runtime reads at module scope.
import { start } from '@neoworks/svelte-gpui'
import './plugins/events'
import { bootKernel } from './kernel/boot'
import { gpuiBridge } from './kernel/sidecar/gpuiBridge'
import Root from './kernel/Root.svelte'
import { corePlugins } from './plugins'

// The window opens at once and fills in as the kernel boots and the plugins activate.
const boot = bootKernel({ plugins: corePlugins, bridge: gpuiBridge })

start(Root, { boot }, { window: { title: 'Mail', width: 1440, height: 900, minWidth: 1024, minHeight: 640 } })
