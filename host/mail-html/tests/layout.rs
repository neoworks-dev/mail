use std::collections::HashMap;

use mail_html::{layout, DrawCommand, FontBackend, FontId, FontMetrics, FontRequest, Viewport};

/// Every character is half the font size wide, so layouts are predictable without real fonts.
struct FixedWidthFonts {
    sizes: Vec<f32>,
}

impl FontBackend for FixedWidthFonts {
    fn create_font(&mut self, request: &FontRequest) -> (FontId, FontMetrics) {
        self.sizes.push(request.size);
        let metrics = FontMetrics {
            ascent: request.size * 0.8,
            descent: request.size * 0.2,
            line_gap: 0.0,
            x_height: request.size * 0.5,
            zero_width: request.size * 0.5,
        };
        (self.sizes.len() - 1, metrics)
    }

    fn text_width(&mut self, text: &str, font: FontId) -> f32 {
        text.chars().count() as f32 * self.sizes[font] * 0.5
    }
}

const VIEWPORT: Viewport = Viewport { width: 600.0, height: 800.0 };

fn texts(commands: &[DrawCommand]) -> Vec<String> {
    commands
        .iter()
        .filter_map(|command| match command {
            DrawCommand::Text { text, .. } => Some(text.clone()),
            _ => None,
        })
        .collect()
}

#[test]
fn records_text_and_background() {
    let mut fonts = FixedWidthFonts { sizes: Vec::new() };
    let html = r#"<body style="background:#ff0000"><p>Hello mail</p></body>"#;
    let list = layout(html, VIEWPORT, &mut fonts, &HashMap::new()).unwrap();

    assert!(texts(&list.commands).join(" ").contains("Hello"));
    let has_canvas_fill = list
        .commands
        .iter()
        .any(|command| matches!(command, DrawCommand::Fill { canvas: true, color, .. } if color.red == 255));
    assert!(has_canvas_fill);
    assert!(list.height > 0.0);
}

#[test]
fn draws_only_supplied_images_at_their_size() {
    let mut fonts = FixedWidthFonts { sizes: Vec::new() };
    let html = r#"<img src="cid:known"><img src="https://tracker.example/pixel.gif">"#;
    let image_sizes = HashMap::from([("cid:known".to_string(), (40.0, 30.0))]);
    let list = layout(html, VIEWPORT, &mut fonts, &image_sizes).unwrap();

    let images: Vec<_> = list
        .commands
        .iter()
        .filter_map(|command| match command {
            DrawCommand::Image { url, tile, .. } => Some((url.clone(), tile.width, tile.height)),
            _ => None,
        })
        .collect();
    assert_eq!(images, vec![("cid:known".to_string(), 40.0, 30.0)]);
}

#[test]
fn numbers_ordered_list_markers() {
    let mut fonts = FixedWidthFonts { sizes: Vec::new() };
    let html = r#"<ol style="list-style-type: lower-roman"><li>one</li><li>two</li></ol><ol start="3"><li>three</li></ol>"#;
    let list = layout(html, VIEWPORT, &mut fonts, &HashMap::new()).unwrap();

    let labels = texts(&list.commands);
    assert!(labels.contains(&"ii.".to_string()), "{labels:?}");
    assert!(labels.contains(&"3.".to_string()), "{labels:?}");
}
