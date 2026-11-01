//! Neomail's native host: a svelte-gpui window that runs the UI bundle, and the Bun sidecar
//! that owns the mail engine. The host relays frames between the two (see `sidecar.rs`) and
//! interprets none of them.
//!
//! ```text
//! bun build.mjs
//! cargo run --release --manifest-path host/Cargo.toml -- --bundle dist/neomail.js
//! ```

mod sidecar;

use sidecar::{Sidecar, SidecarConfig};
use svelte_gpui::{Commands, Options};

fn main() {
    let commands = Commands::new();
    let sidecar = Sidecar::start(SidecarConfig::from_environment(), commands.emitter());
    let commands = sidecar.commands(commands);
    svelte_gpui::run(options().commands(commands));
    sidecar.stop();
}

/// The host's options from the command line, which names the bundle to run.
fn options() -> Options {
    Options::from_command_line().unwrap_or_else(|| {
        eprintln!("usage: neomail --bundle dist/neomail.js");
        std::process::exit(2);
    })
}
