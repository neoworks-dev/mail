//! The litehtml container: answers font, image and viewport questions during layout and
//! records every drawing callback as a [`DrawCommand`].

use std::{cell::RefCell, collections::HashMap};

use litehtml::{
    BackgroundLayer, BackgroundRepeat, BorderRadiuses, BorderStyle, Borders, Color,
    DocumentContainer, DrawContext, FontDescription, FontHandle, LinearGradient, ListMarker,
    ListStyleType, MediaFeatures, MediaType, Position, RadialGradient, Size, TextDecorationLine,
};

use crate::{
    display_list::{
        BorderSide, BorderSides, CornerRadii, DrawCommand, FontId, Gradient, GradientStop,
        ImageRepeat, LineStyle, Rect, Rgba, TextDecoration,
    },
    Viewport,
};

/// A font as CSS asked for it. `families` is the `font-family` list in order, generic names
/// (`serif`, `sans-serif`, `monospace`) included; the backend picks the first it has.
#[derive(Debug, Clone, PartialEq)]
pub struct FontRequest {
    pub families: Vec<String>,
    pub size: f32,
    pub weight: u16,
    pub italic: bool,
}

/// Font metrics in pixels at the requested size; `descent` is positive below the baseline.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct FontMetrics {
    pub ascent: f32,
    pub descent: f32,
    pub line_gap: f32,
    pub x_height: f32,
    pub zero_width: f32,
}

/// Where fonts come from: GPUI's text system in the window, cosmic-text in tests.
pub trait FontBackend {
    fn create_font(&mut self, request: &FontRequest) -> (FontId, FontMetrics);
    fn text_width(&mut self, text: &str, font: FontId) -> f32;
}

struct RecordedFont {
    font: FontId,
    metrics: FontMetrics,
    decoration: Option<TextDecoration>,
}

pub(crate) struct Recorder<'a> {
    fonts: RefCell<&'a mut dyn FontBackend>,
    recorded_fonts: HashMap<usize, RecordedFont>,
    next_handle: usize,
    viewport: Viewport,
    image_sizes: &'a HashMap<String, (f32, f32)>,
    commands: Vec<DrawCommand>,
}

impl<'a> Recorder<'a> {
    pub(crate) fn new(
        fonts: &'a mut dyn FontBackend,
        viewport: Viewport,
        image_sizes: &'a HashMap<String, (f32, f32)>,
    ) -> Self {
        Self {
            fonts: RefCell::new(fonts),
            recorded_fonts: HashMap::new(),
            next_handle: 1,
            viewport,
            image_sizes,
            commands: Vec::new(),
        }
    }

    pub(crate) fn into_commands(self) -> Vec<DrawCommand> {
        self.commands
    }

    fn record_text(&mut self, text: &str, handle: FontHandle, color: Color, position: Position) {
        let Some(recorded) = self.recorded_fonts.get(&handle.0) else {
            return;
        };
        // litehtml sizes the box from the font's height; the baseline sits a descent above its bottom.
        let baseline = position.y + position.height - recorded.metrics.descent;
        self.commands.push(DrawCommand::Text {
            text: text.to_string(),
            font: recorded.font,
            color: rgba(color),
            origin: (position.x, baseline),
            width: position.width,
            ascent: recorded.metrics.ascent,
            decoration: recorded.decoration,
        });
    }
}

impl DocumentContainer for Recorder<'_> {
    fn create_font(&mut self, description: &FontDescription) -> (FontHandle, litehtml::FontMetrics) {
        let request = FontRequest {
            families: font_families(description.family()),
            size: description.size(),
            weight: description.weight().clamp(1, 1000) as u16,
            italic: !matches!(description.style(), litehtml::FontStyle::Normal),
        };
        let (font, metrics) = self.fonts.borrow_mut().create_font(&request);
        let decoration = text_decoration(description);

        let handle = self.next_handle;
        self.next_handle += 1;
        self.recorded_fonts.insert(handle, RecordedFont { font, metrics, decoration });
        (FontHandle(handle), litehtml_metrics(&metrics, description.size(), decoration.is_some()))
    }

    fn delete_font(&mut self, handle: FontHandle) {
        self.recorded_fonts.remove(&handle.0);
    }

    fn text_width(&self, text: &str, handle: FontHandle) -> f32 {
        let Some(recorded) = self.recorded_fonts.get(&handle.0) else {
            return 0.0;
        };
        self.fonts.borrow_mut().text_width(text, recorded.font)
    }

    fn draw_text(&mut self, _: DrawContext, text: &str, handle: FontHandle, color: Color, position: Position) {
        self.record_text(text, handle, color, position);
    }

    fn default_font_name(&self) -> &str {
        "serif"
    }

    fn draw_list_marker(&mut self, _: DrawContext, marker: &ListMarker) {
        let bounds = rect(marker.pos());
        let color = rgba(marker.color());
        match marker.marker_type() {
            ListStyleType::None => {}
            ListStyleType::Disc => self.commands.push(DrawCommand::Ellipse { bounds, color, filled: true }),
            ListStyleType::Circle => self.commands.push(DrawCommand::Ellipse { bounds, color, filled: false }),
            ListStyleType::Square => self.commands.push(DrawCommand::Fill {
                area: bounds,
                radii: CornerRadii::default(),
                color,
                canvas: false,
            }),
            marker_type => {
                let label = format!("{}.", marker_label(marker_type, marker.index()));
                self.record_text(&label, marker.font(), marker.color(), marker.pos());
            }
        }
    }

    fn get_image_size(&self, source: &str, _base_url: &str) -> Size {
        let Some((width, height)) = self.image_sizes.get(source) else {
            return Size::default();
        };
        Size { width: *width, height: *height }
    }

    fn draw_image(&mut self, _: DrawContext, layer: &BackgroundLayer, url: &str, _base_url: &str) {
        if !self.image_sizes.contains_key(url) {
            return;
        }
        self.commands.push(DrawCommand::Image {
            url: url.to_string(),
            tile: rect(layer.origin_box()),
            area: rect(layer.clip_box()),
            radii: corner_radii(layer.border_radius()),
            repeat: image_repeat(layer.repeat()),
        });
    }

    fn draw_solid_fill(&mut self, _: DrawContext, layer: &BackgroundLayer, color: Color) {
        if color.a == 0 {
            return;
        }
        self.commands.push(DrawCommand::Fill {
            area: rect(layer.clip_box()),
            radii: corner_radii(layer.border_radius()),
            color: rgba(color),
            canvas: layer.is_root(),
        });
    }

    fn draw_linear_gradient(&mut self, _: DrawContext, layer: &BackgroundLayer, gradient: &LinearGradient) {
        let start = gradient.start();
        let end = gradient.end();
        self.commands.push(DrawCommand::Gradient {
            area: rect(layer.clip_box()),
            radii: corner_radii(layer.border_radius()),
            gradient: Gradient::Linear {
                start: (start.x, start.y),
                end: (end.x, end.y),
                stops: gradient_stops(gradient.color_points()),
            },
        });
    }

    fn draw_radial_gradient(&mut self, _: DrawContext, layer: &BackgroundLayer, gradient: &RadialGradient) {
        let center = gradient.position();
        let radius = gradient.radius();
        self.commands.push(DrawCommand::Gradient {
            area: rect(layer.clip_box()),
            radii: corner_radii(layer.border_radius()),
            gradient: Gradient::Radial {
                center: (center.x, center.y),
                radius: (radius.x, radius.y),
                stops: gradient_stops(gradient.color_points()),
            },
        });
    }

    fn draw_borders(&mut self, _: DrawContext, borders: &Borders, position: Position, _root: bool) {
        let sides = BorderSides {
            top: border_side(&borders.top),
            right: border_side(&borders.right),
            bottom: border_side(&borders.bottom),
            left: border_side(&borders.left),
        };
        let no_sides = sides.top.is_none() && sides.right.is_none() && sides.bottom.is_none() && sides.left.is_none();
        if no_sides {
            return;
        }
        self.commands.push(DrawCommand::Borders {
            bounds: rect(position),
            radii: corner_radii(borders.radius),
            sides,
        });
    }

    fn import_css(&self, _url: &str, _base_url: &str) -> (String, Option<String>) {
        (String::new(), None)
    }

    fn set_clip(&mut self, position: Position, radius: BorderRadiuses) {
        self.commands.push(DrawCommand::PushClip {
            area: rect(position),
            radii: corner_radii(radius),
        });
    }

    fn del_clip(&mut self) {
        self.commands.push(DrawCommand::PopClip);
    }

    fn get_viewport(&self) -> Position {
        Position {
            x: 0.0,
            y: 0.0,
            width: self.viewport.width,
            height: self.viewport.height,
        }
    }

    fn get_media_features(&self) -> MediaFeatures {
        MediaFeatures {
            media_type: MediaType::Screen,
            width: self.viewport.width,
            height: self.viewport.height,
            device_width: self.viewport.width,
            device_height: self.viewport.height,
            color: 8,
            color_index: 0,
            monochrome: 0,
            resolution: 96.0,
        }
    }
}

/// Splits a CSS `font-family` value into names without quotes.
fn font_families(family: &str) -> Vec<String> {
    family
        .split(',')
        .map(|name| name.trim().trim_matches(['"', '\'']).trim().to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

fn text_decoration(description: &FontDescription) -> Option<TextDecoration> {
    let lines = description.decoration_line();
    let decoration = TextDecoration {
        underline: lines.contains(TextDecorationLine::UNDERLINE),
        overline: lines.contains(TextDecorationLine::OVERLINE),
        line_through: lines.contains(TextDecorationLine::LINE_THROUGH),
        color: rgba(description.decoration_color()),
    };
    if !decoration.underline && !decoration.overline && !decoration.line_through {
        return None;
    }
    Some(decoration)
}

fn litehtml_metrics(metrics: &FontMetrics, size: f32, decorated: bool) -> litehtml::FontMetrics {
    litehtml::FontMetrics {
        font_size: size,
        height: (metrics.ascent + metrics.descent + metrics.line_gap).round(),
        ascent: metrics.ascent.round(),
        descent: metrics.descent.round(),
        x_height: metrics.x_height,
        ch_width: metrics.zero_width,
        draw_spaces: decorated,
        sub_shift: size / 5.0,
        super_shift: size / 3.0,
    }
}

fn marker_label(marker_type: ListStyleType, index: i32) -> String {
    match marker_type {
        ListStyleType::LowerAlpha | ListStyleType::LowerLatin => alphabetic(index).to_lowercase(),
        ListStyleType::UpperAlpha | ListStyleType::UpperLatin => alphabetic(index),
        ListStyleType::LowerRoman => roman(index).to_lowercase(),
        ListStyleType::UpperRoman => roman(index),
        ListStyleType::DecimalLeadingZero => format!("{index:02}"),
        _ => index.to_string(),
    }
}

fn alphabetic(index: i32) -> String {
    let mut remaining = index.max(1);
    let mut letters = Vec::new();
    while remaining > 0 {
        remaining -= 1;
        letters.push((b'A' + (remaining % 26) as u8) as char);
        remaining /= 26;
    }
    letters.iter().rev().collect()
}

fn roman(index: i32) -> String {
    const NUMERALS: [(i32, &str); 13] = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
        (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ];
    let mut remaining = index.clamp(1, 3999);
    let mut numeral = String::new();
    for (value, letters) in NUMERALS {
        while remaining >= value {
            numeral.push_str(letters);
            remaining -= value;
        }
    }
    numeral
}

fn border_side(border: &litehtml::Border) -> Option<BorderSide> {
    if border.width <= 0.0 || border.color.a == 0 {
        return None;
    }
    let style = match border.style {
        BorderStyle::None | BorderStyle::Hidden => return None,
        BorderStyle::Dashed => LineStyle::Dashed,
        BorderStyle::Dotted => LineStyle::Dotted,
        BorderStyle::Double => LineStyle::Double,
        _ => LineStyle::Solid,
    };
    Some(BorderSide {
        width: border.width,
        style,
        color: rgba(border.color),
    })
}

fn image_repeat(repeat: BackgroundRepeat) -> ImageRepeat {
    match repeat {
        BackgroundRepeat::Repeat => ImageRepeat::Both,
        BackgroundRepeat::RepeatX => ImageRepeat::Horizontal,
        BackgroundRepeat::RepeatY => ImageRepeat::Vertical,
        _ => ImageRepeat::None,
    }
}

fn gradient_stops(points: Vec<litehtml::ColorPoint>) -> Vec<GradientStop> {
    points
        .into_iter()
        .map(|point| GradientStop { offset: point.offset, color: rgba(point.color) })
        .collect()
}

fn rect(position: Position) -> Rect {
    Rect {
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
    }
}

fn rgba(color: Color) -> Rgba {
    Rgba {
        red: color.r,
        green: color.g,
        blue: color.b,
        alpha: color.a,
    }
}

fn corner_radii(radius: BorderRadiuses) -> CornerRadii {
    CornerRadii {
        top_left: (radius.top_left_x, radius.top_left_y),
        top_right: (radius.top_right_x, radius.top_right_y),
        bottom_right: (radius.bottom_right_x, radius.bottom_right_y),
        bottom_left: (radius.bottom_left_x, radius.bottom_left_y),
    }
}
