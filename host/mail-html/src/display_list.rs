//! What litehtml asked to draw, in document coordinates and in the order it asked. A painter
//! replays the commands front to back; `PushClip` and `PopClip` nest like a stack.

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgba {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
    pub alpha: u8,
}

/// Corner radii as (horizontal, vertical) pairs, clockwise from the top left.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct CornerRadii {
    pub top_left: (f32, f32),
    pub top_right: (f32, f32),
    pub bottom_right: (f32, f32),
    pub bottom_left: (f32, f32),
}

impl CornerRadii {
    pub fn is_zero(&self) -> bool {
        let corners = [self.top_left, self.top_right, self.bottom_right, self.bottom_left];
        corners.iter().all(|(horizontal, vertical)| *horizontal <= 0.0 || *vertical <= 0.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineStyle {
    Solid,
    Dashed,
    Dotted,
    Double,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BorderSide {
    pub width: f32,
    pub style: LineStyle,
    pub color: Rgba,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BorderSides {
    pub top: Option<BorderSide>,
    pub right: Option<BorderSide>,
    pub bottom: Option<BorderSide>,
    pub left: Option<BorderSide>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageRepeat {
    Both,
    Horizontal,
    Vertical,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GradientStop {
    pub offset: f32,
    pub color: Rgba,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Gradient {
    Linear {
        start: (f32, f32),
        end: (f32, f32),
        stops: Vec<GradientStop>,
    },
    Radial {
        center: (f32, f32),
        radius: (f32, f32),
        stops: Vec<GradientStop>,
    },
}

/// A font the backend created; the id is the backend's own.
pub type FontId = usize;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TextDecoration {
    pub underline: bool,
    pub overline: bool,
    pub line_through: bool,
    pub color: Rgba,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DrawCommand {
    /// `canvas` marks the root background, which covers the whole canvas.
    Fill {
        area: Rect,
        radii: CornerRadii,
        color: Rgba,
        canvas: bool,
    },
    Gradient {
        area: Rect,
        radii: CornerRadii,
        gradient: Gradient,
    },
    Borders {
        bounds: Rect,
        radii: CornerRadii,
        sides: BorderSides,
    },
    /// One image tile spans `tile`; `repeat` says which way it repeats inside `area`.
    Image {
        url: String,
        tile: Rect,
        area: Rect,
        radii: CornerRadii,
        repeat: ImageRepeat,
    },
    Text {
        text: String,
        font: FontId,
        color: Rgba,
        /// Left edge and baseline.
        origin: (f32, f32),
        width: f32,
        ascent: f32,
        decoration: Option<TextDecoration>,
    },
    Ellipse {
        bounds: Rect,
        color: Rgba,
        filled: bool,
    },
    PushClip {
        area: Rect,
        radii: CornerRadii,
    },
    PopClip,
}

#[derive(Debug, Clone, Default)]
pub struct DisplayList {
    pub width: f32,
    pub height: f32,
    pub commands: Vec<DrawCommand>,
}
