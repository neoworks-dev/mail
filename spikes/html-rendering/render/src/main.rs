//! Renders every `.html` file in a corpus directory to a PNG with litehtml's CPU renderer.
//! Each document is laid out twice: once to learn its height, once into a pixmap that fits it.
//! Usage: litehtml-render <corpus directory> <output directory>

use std::{
    env, fs, panic,
    path::{Path, PathBuf},
    time::Instant,
};

use litehtml::{
    html::{decode_data_uri, preprocess_attrs},
    pixbuf::PixbufContainer,
    Document, DrawContext, Position,
};

/// The reading pane's width the comparison is made at.
const VIEWPORT_WIDTH: u32 = 800;
/// The viewport height media queries see while the height is measured.
const VIEWPORT_HEIGHT: u32 = 900;
/// Pages taller than this are cut off rather than allocating a huge pixmap.
const MAX_HEIGHT: u32 = 20_000;

fn main() {
    let arguments: Vec<String> = env::args().collect();
    if arguments.len() != 3 {
        eprintln!("usage: litehtml-render <corpus directory> <output directory>");
        std::process::exit(2);
    }
    let corpus_directory = PathBuf::from(&arguments[1]);
    let output_directory = PathBuf::from(&arguments[2]);
    fs::create_dir_all(&output_directory).expect("cannot create the output directory");

    for path in corpus_files(&corpus_directory) {
        render_file(&path, &output_directory);
    }
}

fn corpus_files(directory: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(directory)
        .expect("cannot read the corpus directory")
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|extension| extension == "html"))
        .collect();
    files.sort();
    files
}

fn render_file(path: &Path, output_directory: &Path) {
    let stem = path.file_stem().unwrap().to_string_lossy().to_string();
    let started = Instant::now();
    let raw = fs::read_to_string(path).expect("cannot read a corpus file");
    let html = preprocess_attrs(&cellpadding_to_css(&raw));
    let images = data_images(&html);

    let rendered = panic::catch_unwind(|| {
        let height = measure_height(&html, &images);
        (height, draw(&html, &images, height))
    });
    let Ok((height, pixels)) = rendered else {
        println!("{stem}: FAILED (panic)");
        return;
    };

    let output = output_directory.join(format!("{stem}.png"));
    save_on_white(&pixels, VIEWPORT_WIDTH, height, &output);
    println!(
        "{stem}: {VIEWPORT_WIDTH}x{height} in {} ms",
        started.elapsed().as_millis()
    );
}

/// The `data:` URLs the document's `src` attributes use, decoded, keyed by the exact URL
/// litehtml will ask the container for.
fn data_images(html: &str) -> Vec<(String, Vec<u8>)> {
    let mut images = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.find("src=\"data:") {
        let after_quote = &rest[start + 5..];
        let end = after_quote.find('"').unwrap_or(after_quote.len());
        let uri = &after_quote[..end];
        if let Some(bytes) = decode_data_uri(uri) {
            images.push((uri.to_string(), bytes));
        }
        rest = &after_quote[end..];
    }
    images
}

/// litehtml ignores `cellpadding`, so each such table gets a class and a rule padding its own
/// cells. Unlike the browser's presentational hint, the rule outranks author `td` rules.
fn cellpadding_to_css(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut output = String::with_capacity(html.len());
    let mut rules = String::new();
    let mut copied_until = 0;
    let mut search_from = 0;
    while let Some(offset) = lower[search_from..].find("<table") {
        let tag_start = search_from + offset;
        let tag_end = tag_start + lower[tag_start..].find('>').unwrap_or(0);
        search_from = tag_start + 6;
        let Some(padding) = cellpadding_value(&lower[tag_start..tag_end]) else {
            continue;
        };
        let class_name = format!("spike-cellpadding-{padding}");
        output.push_str(&html[copied_until..tag_start + 6]);
        output.push_str(&format!(" class=\"{class_name}\""));
        copied_until = tag_start + 6;
        rules.push_str(&format!(
            ".{class_name} > tbody > tr > td, .{class_name} > tbody > tr > th, \
             .{class_name} > tr > td {{ padding: {padding}px; }}\n"
        ));
    }
    output.push_str(&html[copied_until..]);
    if rules.is_empty() {
        return output;
    }
    format!("<style>{rules}</style>{output}")
}

fn cellpadding_value(tag: &str) -> Option<u32> {
    let after_name = &tag[tag.find("cellpadding")? + 11..];
    let after_equals = after_name.trim_start().strip_prefix('=')?.trim_start();
    let digits: String = after_equals
        .trim_start_matches(['"', '\''])
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

fn new_container(height: u32, images: &[(String, Vec<u8>)]) -> PixbufContainer {
    let mut container = PixbufContainer::new(VIEWPORT_WIDTH, height);
    for (uri, bytes) in images {
        container.load_image_data(uri, bytes);
    }
    container
}

fn measure_height(html: &str, images: &[(String, Vec<u8>)]) -> u32 {
    let mut container = new_container(VIEWPORT_HEIGHT, images);
    let Ok(mut document) = Document::from_html(html, &mut container, None, None) else {
        return 1;
    };
    let _ = document.render(VIEWPORT_WIDTH as f32);
    (document.height().ceil() as u32).clamp(1, MAX_HEIGHT)
}

fn draw(html: &str, images: &[(String, Vec<u8>)], height: u32) -> Vec<u8> {
    let mut container = new_container(height, images);
    {
        let Ok(mut document) = Document::from_html(html, &mut container, None, None) else {
            return container.pixels().to_vec();
        };
        let _ = document.render(VIEWPORT_WIDTH as f32);
        let clip = Position {
            x: 0.0,
            y: 0.0,
            width: VIEWPORT_WIDTH as f32,
            height: height as f32,
        };
        document.draw(DrawContext::default(), 0.0, 0.0, Some(clip));
    }
    container.pixels().to_vec()
}

/// Composites premultiplied RGBA over white, as a browser page without a background shows.
fn save_on_white(pixels: &[u8], width: u32, height: u32, output: &Path) {
    let mut opaque = Vec::with_capacity(pixels.len());
    for pixel in pixels.chunks_exact(4) {
        let transparency = 255 - pixel[3] as u32;
        for channel in &pixel[..3] {
            opaque.push((*channel as u32 + transparency).min(255) as u8);
        }
        opaque.push(255);
    }
    image::save_buffer(output, &opaque, width, height, image::ColorType::Rgba8)
        .expect("cannot write a PNG");
}
