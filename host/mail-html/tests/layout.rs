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

fn text_origin(commands: &[DrawCommand], wanted: &str) -> (f32, f32) {
    commands
        .iter()
        .find_map(|command| match command {
            DrawCommand::Text { text, origin, .. } if text == wanted => Some(*origin),
            _ => None,
        })
        .unwrap_or_else(|| panic!("no text {wanted:?} in {:?}", texts(commands)))
}

fn layout_html(html: &str) -> mail_html::DisplayList {
    let mut fonts = FixedWidthFonts { sizes: Vec::new() };
    layout(html, VIEWPORT, &mut fonts, &HashMap::new()).unwrap()
}

#[test]
fn percentage_height_under_auto_parent_stays_auto() {
    let list = layout_html(r#"<!DOCTYPE html><body style="margin:0"><div style="height:100%">short</div></body>"#);

    assert!(list.height < 100.0, "page is {} tall", list.height);
}

#[test]
fn align_center_centres_block_children() {
    let html = r#"<body style="margin:0"><table width="600" cellspacing="0" cellpadding="0"><tr><td align="center">
        <table style="width:200px" cellspacing="0" cellpadding="0"><tr><td style="text-align:left">middle</td></tr></table>
    </td></tr></table></body>"#;
    let list = layout_html(html);

    let (x, _) = text_origin(&list.commands, "middle");
    assert!((x - 200.0).abs() < 2.0, "table starts at {x}");
}

#[test]
fn empty_cell_with_height_keeps_it() {
    let html = r#"<body style="margin:0"><table cellspacing="0" cellpadding="0"><tr><td height="40"></td></tr></table><p style="margin:0">after</p></body>"#;
    let list = layout_html(html);

    let (_, baseline) = text_origin(&list.commands, "after");
    assert!(baseline > 40.0, "text baseline at {baseline}");
}

#[test]
fn margins_collapse_through_empty_blocks() {
    let html = r#"<body style="margin:0"><div style="padding-top:1px"><p style="margin:20px 0"></p><p style="margin:20px 0"></p><div>after</div></div></body>"#;
    let list = layout_html(html);

    let (_, baseline) = text_origin(&list.commands, "after");
    assert!(baseline < 40.0, "text baseline at {baseline}, margins stacked");
}

#[test]
fn max_width_bounds_shrink_to_fit_columns() {
    let column = r#"<div style="width:100%;max-width:150px;display:inline-block;font-size:16px">COLUMN</div>"#;
    let html = format!(r#"<body style="margin:0"><table width="600" cellspacing="0" cellpadding="0"><tr><td><div style="font-size:0">{column}{column}{column}</div></td></tr></table></body>"#);
    let list = layout_html(&html);

    let rows: Vec<f32> = list
        .commands
        .iter()
        .filter_map(|command| match command {
            DrawCommand::Text { text, origin, .. } if text == "COLUMN" => Some(origin.1),
            _ => None,
        })
        .collect();
    assert_eq!(rows.len(), 3);
    assert!(rows.iter().all(|row| *row == rows[0]), "columns wrapped: {rows:?}");
}

#[test]
fn long_urls_wrap_at_punctuation() {
    let html = r#"<body style="margin:0"><div style="width:200px">https://example.com/project/302125/inbox/reports/11f1f28a?link_source=first_report_email</div></body>"#;
    let list = layout_html(html);

    let right_edge = list
        .commands
        .iter()
        .filter_map(|command| match command {
            DrawCommand::Text { origin, width, .. } => Some(origin.0 + width),
            _ => None,
        })
        .fold(0.0, f32::max);
    assert!(right_edge <= 200.0, "text reaches {right_edge}");
}

#[test]
fn cells_centre_block_content_vertically() {
    let html = r#"<body style="margin:0"><table cellspacing="0" cellpadding="0"><tr><td style="height:100px"><div>middle</div></td></tr></table></body>"#;
    let list = layout_html(html);

    let (_, baseline) = text_origin(&list.commands, "middle");
    assert!(baseline > 40.0 && baseline < 70.0, "text baseline at {baseline}");
}

#[test]
fn deeply_nested_tables_lay_out_quickly() {
    let depth = 20;
    let opening = r#"<table><tr><td>"#.repeat(depth);
    let closing = r#"</td></tr></table>"#.repeat(depth);
    let html = format!("{opening}deep{closing}");
    let started = std::time::Instant::now();
    let list = layout_html(&html);

    assert!(texts(&list.commands).contains(&"deep".to_string()));
    // Measuring each cell anew at every level made this grow as 3^depth.
    assert!(started.elapsed().as_millis() < 500, "took {:?}", started.elapsed());
}
