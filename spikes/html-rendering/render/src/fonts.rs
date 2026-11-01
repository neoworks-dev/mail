//! A cosmic-text font backend, the text stack GPUI itself uses on Linux. Family names are
//! resolved the way Chromium does on Linux: installed families by name, fontconfig's metric
//! aliases for Arial, Helvetica, Times and Courier, generic names through `fc-match`.

use std::{collections::HashMap, process::Command};

use cosmic_text::{
    fontdb,
    Attrs, Buffer, Color, Family, FontSystem, Metrics, Shaping, Style, SwashCache, Weight,
};
use mail_html::{FontBackend, FontId, FontMetrics, FontRequest};

const METRIC_ALIASES: [&str; 6] = [
    "arial",
    "helvetica",
    "times",
    "times new roman",
    "courier",
    "courier new",
];

struct LoadedFont {
    family: String,
    size: f32,
    weight: u16,
    italic: bool,
    metrics: Option<FontMetrics>,
}

pub struct CosmicFonts {
    font_system: FontSystem,
    swash_cache: SwashCache,
    loaded: Vec<LoadedFont>,
    resolved_families: HashMap<String, Option<String>>,
    widths: HashMap<(String, FontId), f32>,
}

impl CosmicFonts {
    pub fn new() -> Self {
        Self {
            font_system: FontSystem::new(),
            swash_cache: SwashCache::new(),
            loaded: Vec::new(),
            resolved_families: HashMap::new(),
            widths: HashMap::new(),
        }
    }

    /// Calls `plot` with every covered pixel of `text`, at offsets from its left edge and baseline.
    pub fn draw_text(&mut self, text: &str, font: FontId, color: Color, mut plot: impl FnMut(i32, i32, Color)) {
        let buffer = self.shape(text, font);
        let baseline = buffer.layout_runs().next().map_or(0.0, |run| run.line_y);
        buffer.draw(&mut self.font_system, &mut self.swash_cache, color, |x, y, width, height, color| {
            for row in 0..height as i32 {
                for column in 0..width as i32 {
                    plot(x + column, y + row - baseline.round() as i32, color);
                }
            }
        });
    }

    fn shape(&mut self, text: &str, font: FontId) -> Buffer {
        let loaded = &self.loaded[font];
        let mut buffer = Buffer::new(&mut self.font_system, Metrics::new(loaded.size, loaded.size * 1.2));
        buffer.set_size(&mut self.font_system, None, None);
        let attrs = Attrs::new()
            .family(Family::Name(&loaded.family))
            .weight(Weight(loaded.weight))
            .style(if_italic(loaded.italic));
        buffer.set_text(&mut self.font_system, text, &attrs, Shaping::Advanced);
        buffer.shape_until_scroll(&mut self.font_system, false);
        buffer
    }

    fn resolve_family(&mut self, families: &[String]) -> String {
        for family in families {
            if let Some(resolved) = self.resolve_one(family) {
                return resolved;
            }
        }
        self.resolve_one("serif").unwrap_or_default()
    }

    fn resolve_one(&mut self, family: &str) -> Option<String> {
        let key = family.to_lowercase();
        if let Some(resolved) = self.resolved_families.get(&key) {
            return resolved.clone();
        }
        let resolved = self.lookup_family(&key);
        self.resolved_families.insert(key, resolved.clone());
        resolved
    }

    fn lookup_family(&self, key: &str) -> Option<String> {
        if matches!(key, "serif" | "sans-serif" | "monospace") {
            return Some(fc_match(key));
        }
        if matches!(key, "system-ui" | "-apple-system" | "blinkmacsystemfont" | "ui-sans-serif") {
            return Some(fc_match("sans-serif"));
        }
        if METRIC_ALIASES.contains(&key) {
            return Some(fc_match(key));
        }
        self.installed_family(key)
    }

    fn installed_family(&self, key: &str) -> Option<String> {
        self.font_system.db().faces().find_map(|face| {
            face.families
                .iter()
                .find(|(name, _)| name.to_lowercase() == key)
                .map(|(name, _)| name.clone())
        })
    }

    fn metrics(&mut self, font: FontId) -> FontMetrics {
        let loaded = &self.loaded[font];
        let size = loaded.size;
        let query = fontdb::Query {
            families: &[fontdb::Family::Name(&loaded.family)],
            weight: fontdb::Weight(loaded.weight),
            stretch: fontdb::Stretch::Normal,
            style: if_italic(loaded.italic),
        };
        let Some(face_id) = self.font_system.db().query(&query) else {
            return FontMetrics { ascent: size * 0.8, descent: size * 0.2, ..Default::default() };
        };
        let Some(face) = self.font_system.get_font(face_id) else {
            return FontMetrics { ascent: size * 0.8, descent: size * 0.2, ..Default::default() };
        };
        let swash = face.as_swash();
        let metrics = swash.metrics(&[]).scale(size);
        let zero = swash.charmap().map('0');
        FontMetrics {
            ascent: metrics.ascent,
            descent: metrics.descent,
            line_gap: metrics.leading,
            x_height: metrics.x_height,
            zero_width: swash.glyph_metrics(&[]).scale(size).advance_width(zero),
        }
    }
}

impl FontBackend for CosmicFonts {
    fn create_font(&mut self, request: &FontRequest) -> (FontId, FontMetrics) {
        let family = self.resolve_family(&request.families);
        // Reuse the id of an identical font, so widths cached for one mail serve the next.
        let existing = self.loaded.iter().position(|font| {
            font.family == family && font.size == request.size && font.weight == request.weight && font.italic == request.italic
        });
        if let Some(font) = existing {
            return (font, self.loaded[font].metrics.unwrap());
        }
        self.loaded.push(LoadedFont {
            family,
            size: request.size,
            weight: request.weight,
            italic: request.italic,
            metrics: None,
        });
        let font = self.loaded.len() - 1;
        let metrics = self.metrics(font);
        self.loaded[font].metrics = Some(metrics);
        (font, metrics)
    }

    fn text_width(&mut self, text: &str, font: FontId) -> f32 {
        let key = (text.to_string(), font);
        if let Some(width) = self.widths.get(&key) {
            return *width;
        }
        let buffer = self.shape(text, font);
        let width = buffer.layout_runs().map(|run| run.line_w).fold(0.0, f32::max);
        self.widths.insert(key, width);
        width
    }
}

fn if_italic(italic: bool) -> Style {
    if italic {
        return Style::Italic;
    }
    Style::Normal
}

fn fc_match(pattern: &str) -> String {
    let output = Command::new("fc-match").arg(pattern).arg("--format=%{family[0]}").output();
    let Ok(output) = output else {
        return pattern.to_string();
    };
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}
