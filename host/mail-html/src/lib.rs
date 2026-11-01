//! HTML mail layout without a browser. litehtml parses and lays out the document; the
//! container in `recorder` turns its drawing callbacks into a [`DisplayList`], so any painter
//! (GPUI in the window, tiny-skia in tests) can draw the same result. Nothing here fetches:
//! stylesheets from `<link>` are ignored and images are only the ones the caller supplies.

mod display_list;
mod recorder;

pub use display_list::*;
pub use recorder::{FontBackend, FontMetrics, FontRequest};

use std::collections::HashMap;

use litehtml::Document;
use recorder::Recorder;

/// The size the page is laid out for. `height` only matters to media queries and
/// viewport-relative lengths; the document grows past it.
#[derive(Debug, Clone, Copy)]
pub struct Viewport {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug)]
pub enum LayoutError {
    /// The HTML contained a NUL byte or litehtml refused it.
    Unparseable,
}

/// Lays `html` out at the viewport's width and records how it draws. `image_sizes` maps each
/// image URL the document may reference to its intrinsic size; unknown images take no space
/// unless the markup sizes them.
pub fn layout(
    html: &str,
    viewport: Viewport,
    fonts: &mut dyn FontBackend,
    image_sizes: &HashMap<String, (f32, f32)>,
) -> Result<DisplayList, LayoutError> {
    let mut recorder = Recorder::new(fonts, viewport, image_sizes);
    let width;
    let height;
    {
        let mut document = Document::from_html(html, &mut recorder, None, None)
            .map_err(|_| LayoutError::Unparseable)?;
        let _ = document.render(viewport.width);
        width = document.width();
        height = document.height();
        document.draw(litehtml::DrawContext::default(), 0.0, 0.0, None);
    }
    Ok(DisplayList {
        width,
        height,
        commands: recorder.into_commands(),
    })
}
