//! Replays a mail-html display list into a tiny-skia pixmap. This stands in for the GPUI
//! painter: every command maps to one GPUI primitive (quad, path, sprite, glyph run).

use std::collections::HashMap;

use mail_html::{
    BorderSide, BorderSides, CornerRadii, DisplayList, DrawCommand, FontId, Gradient,
    GradientStop, ImageRepeat, LineStyle, Rect, Rgba, TextDecoration,
};
use tiny_skia::{
    FillRule, FilterQuality, Mask, Paint, PathBuilder, Pattern, Pixmap, Shader, SpreadMode,
    Stroke, StrokeDash, Transform,
};

use crate::fonts::CosmicFonts;

pub struct Painter<'a> {
    pixmap: Pixmap,
    clips: Vec<Mask>,
    fonts: &'a mut CosmicFonts,
    images: &'a HashMap<String, Pixmap>,
}

impl<'a> Painter<'a> {
    pub fn new(width: u32, height: u32, fonts: &'a mut CosmicFonts, images: &'a HashMap<String, Pixmap>) -> Self {
        let mut pixmap = Pixmap::new(width.max(1), height.max(1)).expect("pixmap size");
        pixmap.fill(tiny_skia::Color::WHITE);
        Self { pixmap, clips: Vec::new(), fonts, images }
    }

    pub fn paint(mut self, list: &DisplayList) -> Pixmap {
        for command in &list.commands {
            self.paint_command(command);
        }
        self.pixmap
    }

    fn paint_command(&mut self, command: &DrawCommand) {
        match command {
            DrawCommand::Fill { area, radii, color, canvas } => self.fill(*area, *radii, *color, *canvas),
            DrawCommand::Gradient { area, radii, gradient } => self.gradient(*area, *radii, gradient),
            DrawCommand::Borders { bounds, radii, sides } => self.borders(*bounds, *radii, sides),
            DrawCommand::Image { url, tile, area, radii, repeat } => self.image(url, *tile, *area, *radii, *repeat),
            DrawCommand::Text { text, font, color, origin, ascent, decoration, width } => {
                self.text(text, *font, *color, *origin);
                if let Some(decoration) = decoration {
                    self.decoration(decoration, *origin, *width, *ascent);
                }
            }
            DrawCommand::Ellipse { bounds, color, filled } => self.ellipse(*bounds, *color, *filled),
            DrawCommand::PushClip { area, radii } => self.push_clip(*area, *radii),
            DrawCommand::PopClip => {
                self.clips.pop();
            }
        }
    }

    fn fill(&mut self, area: Rect, radii: CornerRadii, color: Rgba, canvas: bool) {
        let mut area = area;
        if canvas {
            area = Rect { x: 0.0, y: 0.0, width: self.pixmap.width() as f32, height: self.pixmap.height() as f32 };
        }
        let Some(path) = rounded_rect(area, radii) else {
            return;
        };
        let paint = solid_paint(color);
        let mask = self.clips.last();
        self.pixmap.fill_path(&path, &paint, FillRule::Winding, Transform::identity(), mask);
    }

    fn gradient(&mut self, area: Rect, radii: CornerRadii, gradient: &Gradient) {
        let Some(path) = rounded_rect(area, radii) else {
            return;
        };
        let Some(shader) = gradient_shader(gradient) else {
            return;
        };
        let paint = Paint { shader, anti_alias: true, ..Default::default() };
        let mask = self.clips.last();
        self.pixmap.fill_path(&path, &paint, FillRule::Winding, Transform::identity(), mask);
    }

    fn borders(&mut self, bounds: Rect, radii: CornerRadii, sides: &BorderSides) {
        let uniform = [sides.right, sides.bottom, sides.left].iter().all(|side| *side == sides.top);
        if let (true, Some(side)) = (uniform, sides.top) {
            self.uniform_border(bounds, radii, side);
            return;
        }
        let edges = [
            (sides.top, Rect { height: side_width(sides.top), ..bounds }),
            (sides.bottom, Rect { y: bounds.y + bounds.height - side_width(sides.bottom), height: side_width(sides.bottom), ..bounds }),
            (sides.left, Rect { width: side_width(sides.left), ..bounds }),
            (sides.right, Rect { x: bounds.x + bounds.width - side_width(sides.right), width: side_width(sides.right), ..bounds }),
        ];
        for (side, edge) in edges {
            let Some(side) = side else {
                continue;
            };
            self.fill(edge, CornerRadii::default(), side.color, false);
        }
    }

    fn uniform_border(&mut self, bounds: Rect, radii: CornerRadii, side: BorderSide) {
        let inset = side.width / 2.0;
        let inner = Rect {
            x: bounds.x + inset,
            y: bounds.y + inset,
            width: bounds.width - side.width,
            height: bounds.height - side.width,
        };
        let Some(path) = rounded_rect(inner, shrink_radii(radii, inset)) else {
            return;
        };
        let mut stroke = Stroke { width: side.width, ..Default::default() };
        stroke.dash = dash_pattern(side);
        let mask = self.clips.last();
        self.pixmap.stroke_path(&path, &solid_paint(side.color), &stroke, Transform::identity(), mask);
    }

    fn image(&mut self, url: &str, tile: Rect, area: Rect, radii: CornerRadii, repeat: ImageRepeat) {
        let Some(image) = self.images.get(url) else {
            return;
        };
        if tile.width <= 0.0 || tile.height <= 0.0 {
            return;
        }
        let covered = repeated_area(tile, area, repeat);
        let Some(path) = rounded_rect(covered, radii) else {
            return;
        };
        let scale_x = tile.width / image.width() as f32;
        let scale_y = tile.height / image.height() as f32;
        let transform = Transform::from_row(scale_x, 0.0, 0.0, scale_y, tile.x, tile.y);
        let shader = Pattern::new(image.as_ref(), SpreadMode::Repeat, FilterQuality::Bilinear, 1.0, transform);
        let paint = Paint { shader, anti_alias: true, ..Default::default() };
        let mask = self.clips.last();
        self.pixmap.fill_path(&path, &paint, FillRule::Winding, Transform::identity(), mask);
    }

    fn text(&mut self, text: &str, font: FontId, color: Rgba, origin: (f32, f32)) {
        let left = origin.0.round() as i32;
        let baseline = origin.1.round() as i32;
        let base_color = cosmic_text::Color::rgba(color.red, color.green, color.blue, color.alpha);
        let pixmap = &mut self.pixmap;
        let mask = self.clips.last();
        self.fonts.draw_text(text, font, base_color, |x, y, glyph_color| {
            blend_pixel(pixmap, mask, left + x, baseline + y, glyph_color);
        });
    }

    fn decoration(&mut self, decoration: &TextDecoration, origin: (f32, f32), width: f32, ascent: f32) {
        let thickness = (ascent / 12.0).max(1.0);
        let mut lines = Vec::new();
        if decoration.underline {
            lines.push(origin.1 + ascent * 0.12);
        }
        if decoration.line_through {
            lines.push(origin.1 - ascent * 0.3);
        }
        if decoration.overline {
            lines.push(origin.1 - ascent);
        }
        for y in lines {
            let line = Rect { x: origin.0, y, width, height: thickness };
            self.fill(line, CornerRadii::default(), decoration.color, false);
        }
    }

    fn ellipse(&mut self, bounds: Rect, color: Rgba, filled: bool) {
        let radius = bounds.width.min(bounds.height) / 2.0;
        let Some(path) = PathBuilder::from_circle(bounds.x + bounds.width / 2.0, bounds.y + bounds.height / 2.0, radius) else {
            return;
        };
        let paint = solid_paint(color);
        let mask = self.clips.last();
        if filled {
            self.pixmap.fill_path(&path, &paint, FillRule::Winding, Transform::identity(), mask);
            return;
        }
        let stroke = Stroke { width: 1.0, ..Default::default() };
        self.pixmap.stroke_path(&path, &paint, &stroke, Transform::identity(), mask);
    }

    fn push_clip(&mut self, area: Rect, radii: CornerRadii) {
        let mut mask = match self.clips.last() {
            Some(current) => current.clone(),
            None => self.full_mask(),
        };
        if let Some(path) = rounded_rect(area, radii) {
            mask.intersect_path(&path, FillRule::Winding, true, Transform::identity());
        }
        self.clips.push(mask);
    }

    fn full_mask(&self) -> Mask {
        let mut mask = Mask::new(self.pixmap.width(), self.pixmap.height()).expect("mask size");
        let whole = tiny_skia::Rect::from_xywh(0.0, 0.0, self.pixmap.width() as f32, self.pixmap.height() as f32).unwrap();
        mask.fill_path(&PathBuilder::from_rect(whole), FillRule::Winding, false, Transform::identity());
        mask
    }
}

fn side_width(side: Option<BorderSide>) -> f32 {
    side.map_or(0.0, |side| side.width)
}

fn dash_pattern(side: BorderSide) -> Option<StrokeDash> {
    match side.style {
        LineStyle::Dashed => StrokeDash::new(vec![side.width * 3.0, side.width * 3.0], 0.0),
        LineStyle::Dotted => StrokeDash::new(vec![side.width, side.width], 0.0),
        _ => None,
    }
}

/// The part of `area` an image covers given how its tile repeats.
fn repeated_area(tile: Rect, area: Rect, repeat: ImageRepeat) -> Rect {
    let band = match repeat {
        ImageRepeat::Both => area,
        ImageRepeat::Horizontal => Rect { y: tile.y, height: tile.height, ..area },
        ImageRepeat::Vertical => Rect { x: tile.x, width: tile.width, ..area },
        ImageRepeat::None => tile,
    };
    intersect(band, area)
}

fn intersect(first: Rect, second: Rect) -> Rect {
    let left = first.x.max(second.x);
    let top = first.y.max(second.y);
    let right = (first.x + first.width).min(second.x + second.width);
    let bottom = (first.y + first.height).min(second.y + second.height);
    Rect { x: left, y: top, width: (right - left).max(0.0), height: (bottom - top).max(0.0) }
}

fn shrink_radii(radii: CornerRadii, by: f32) -> CornerRadii {
    let shrink = |(horizontal, vertical): (f32, f32)| ((horizontal - by).max(0.0), (vertical - by).max(0.0));
    CornerRadii {
        top_left: shrink(radii.top_left),
        top_right: shrink(radii.top_right),
        bottom_right: shrink(radii.bottom_right),
        bottom_left: shrink(radii.bottom_left),
    }
}

/// A rectangle with elliptical corners, radii scaled down together when they overlap as CSS does.
fn rounded_rect(area: Rect, radii: CornerRadii) -> Option<tiny_skia::Path> {
    if area.width <= 0.0 || area.height <= 0.0 {
        return None;
    }
    if radii.is_zero() {
        let rect = tiny_skia::Rect::from_xywh(area.x, area.y, area.width, area.height)?;
        return Some(PathBuilder::from_rect(rect));
    }
    let radii = fit_radii(area, radii);
    let (left, top) = (area.x, area.y);
    let (right, bottom) = (area.x + area.width, area.y + area.height);
    // Bézier handle length for a quarter ellipse.
    const K: f32 = 0.552_284_8;
    let mut builder = PathBuilder::new();
    let (horizontal, vertical) = radii.top_left;
    builder.move_to(left + horizontal, top);
    let (horizontal, vertical_tr) = radii.top_right;
    builder.line_to(right - horizontal, top);
    builder.cubic_to(right - horizontal * (1.0 - K), top, right, top + vertical_tr * (1.0 - K), right, top + vertical_tr);
    let (horizontal, vertical_br) = radii.bottom_right;
    builder.line_to(right, bottom - vertical_br);
    builder.cubic_to(right, bottom - vertical_br * (1.0 - K), right - horizontal * (1.0 - K), bottom, right - horizontal, bottom);
    let (horizontal, vertical_bl) = radii.bottom_left;
    builder.line_to(left + horizontal, bottom);
    builder.cubic_to(left + horizontal * (1.0 - K), bottom, left, bottom - vertical_bl * (1.0 - K), left, bottom - vertical_bl);
    let (horizontal_tl, _) = radii.top_left;
    builder.line_to(left, top + vertical);
    builder.cubic_to(left, top + vertical * (1.0 - K), left + horizontal_tl * (1.0 - K), top, left + horizontal_tl, top);
    builder.close();
    builder.finish()
}

fn fit_radii(area: Rect, radii: CornerRadii) -> CornerRadii {
    let horizontal_sums = [radii.top_left.0 + radii.top_right.0, radii.bottom_left.0 + radii.bottom_right.0];
    let vertical_sums = [radii.top_left.1 + radii.bottom_left.1, radii.top_right.1 + radii.bottom_right.1];
    let mut factor: f32 = 1.0;
    for sum in horizontal_sums {
        if sum > area.width {
            factor = factor.min(area.width / sum);
        }
    }
    for sum in vertical_sums {
        if sum > area.height {
            factor = factor.min(area.height / sum);
        }
    }
    let scale = |(horizontal, vertical): (f32, f32)| (horizontal.max(0.0) * factor, vertical.max(0.0) * factor);
    CornerRadii {
        top_left: scale(radii.top_left),
        top_right: scale(radii.top_right),
        bottom_right: scale(radii.bottom_right),
        bottom_left: scale(radii.bottom_left),
    }
}

fn gradient_shader(gradient: &Gradient) -> Option<Shader<'static>> {
    match gradient {
        Gradient::Linear { start, end, stops } => tiny_skia::LinearGradient::new(
            tiny_skia::Point::from_xy(start.0, start.1),
            tiny_skia::Point::from_xy(end.0, end.1),
            skia_stops(stops),
            SpreadMode::Pad,
            Transform::identity(),
        ),
        Gradient::Radial { center, radius, stops } => tiny_skia::RadialGradient::new(
            tiny_skia::Point::from_xy(center.0, center.1),
            tiny_skia::Point::from_xy(center.0, center.1),
            radius.0.max(radius.1),
            skia_stops(stops),
            SpreadMode::Pad,
            Transform::identity(),
        ),
    }
}

fn skia_stops(stops: &[GradientStop]) -> Vec<tiny_skia::GradientStop> {
    stops
        .iter()
        .map(|stop| tiny_skia::GradientStop::new(stop.offset, skia_color(stop.color)))
        .collect()
}

fn skia_color(color: Rgba) -> tiny_skia::Color {
    tiny_skia::Color::from_rgba8(color.red, color.green, color.blue, color.alpha)
}

fn solid_paint(color: Rgba) -> Paint<'static> {
    let mut paint = Paint::default();
    paint.set_color(skia_color(color));
    paint.anti_alias = true;
    paint
}

/// Source-over blends one glyph pixel, scaled by the clip mask's coverage there.
fn blend_pixel(pixmap: &mut Pixmap, mask: Option<&Mask>, x: i32, y: i32, color: cosmic_text::Color) {
    if x < 0 || y < 0 || x >= pixmap.width() as i32 || y >= pixmap.height() as i32 {
        return;
    }
    let index = y as usize * pixmap.width() as usize + x as usize;
    let mut coverage = color.a() as u32;
    if let Some(mask) = mask {
        coverage = coverage * mask.data()[index] as u32 / 255;
    }
    if coverage == 0 {
        return;
    }
    let pixel = &mut pixmap.data_mut()[index * 4..index * 4 + 4];
    let source = [color.r() as u32, color.g() as u32, color.b() as u32];
    for channel in 0..3 {
        pixel[channel] = ((source[channel] * coverage + pixel[channel] as u32 * (255 - coverage)) / 255) as u8;
    }
    pixel[3] = (coverage + pixel[3] as u32 * (255 - coverage) / 255) as u8;
}
