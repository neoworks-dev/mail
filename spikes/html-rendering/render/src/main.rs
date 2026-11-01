//! Renders every `.html` file in a corpus directory to a PNG: mail-html lays it out into a
//! display list, and a tiny-skia painter standing in for GPUI draws that list.
//! Usage: litehtml-render <corpus directory> <output directory>

mod fonts;
mod paint;

use std::{
    collections::HashMap,
    env, fs, panic,
    path::{Path, PathBuf},
    time::Instant,
};

use fonts::CosmicFonts;
use litehtml::html::{decode_data_uri, preprocess_attrs};
use mail_html::{layout, Viewport};
use paint::Painter;
use tiny_skia::Pixmap;

/// The reading pane's width the comparison is made at.
const VIEWPORT_WIDTH: f32 = 800.0;
/// The viewport height media queries and viewport units see.
const VIEWPORT_HEIGHT: f32 = 900.0;
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

    let mut fonts = CosmicFonts::new();
    for path in corpus_files(&corpus_directory) {
        render_file(&path, &output_directory, &mut fonts);
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

fn render_file(path: &Path, output_directory: &Path, fonts: &mut CosmicFonts) {
    let stem = path.file_stem().unwrap().to_string_lossy().to_string();
    let started = Instant::now();
    let raw = fs::read_to_string(path).expect("cannot read a corpus file");
    let html = preprocess_attrs(&cellpadding_to_css(&raw));
    let images = decoded_images(&html);
    let image_sizes: HashMap<String, (f32, f32)> = images
        .iter()
        .map(|(url, pixmap)| (url.clone(), (pixmap.width() as f32, pixmap.height() as f32)))
        .collect();

    let viewport = Viewport { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT };
    let rendered = panic::catch_unwind(panic::AssertUnwindSafe(|| layout(&html, viewport, fonts, &image_sizes)));
    let Ok(Ok(list)) = rendered else {
        println!("{stem}: FAILED");
        return;
    };
    let laid_out = started.elapsed();

    let height = (list.height.ceil() as u32).clamp(1, MAX_HEIGHT);
    let pixmap = Painter::new(VIEWPORT_WIDTH as u32, height, fonts, &images).paint(&list);
    pixmap
        .save_png(output_directory.join(format!("{stem}.png")))
        .expect("cannot write a PNG");
    println!(
        "{stem}: {}x{height}, {} commands, layout {} ms, total {} ms",
        VIEWPORT_WIDTH,
        list.commands.len(),
        laid_out.as_millis(),
        started.elapsed().as_millis()
    );
}

/// The `data:` images the document's `src` attributes use, decoded and keyed by the exact
/// URL litehtml will ask about.
fn decoded_images(html: &str) -> HashMap<String, Pixmap> {
    let mut images = HashMap::new();
    let mut rest = html;
    while let Some(start) = rest.find("src=\"data:") {
        let after_quote = &rest[start + 5..];
        let end = after_quote.find('"').unwrap_or(after_quote.len());
        let uri = &after_quote[..end];
        if let Some(pixmap) = decode_data_uri(uri).and_then(|bytes| decode_image(&bytes)) {
            images.insert(uri.to_string(), pixmap);
        }
        rest = &after_quote[end..];
    }
    images
}

fn decode_image(bytes: &[u8]) -> Option<Pixmap> {
    let rgba = image::load_from_memory(bytes).ok()?.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut premultiplied = rgba.into_raw();
    for pixel in premultiplied.chunks_exact_mut(4) {
        let alpha = pixel[3] as u32;
        for channel in &mut pixel[..3] {
            *channel = ((*channel as u32 * alpha + 127) / 255) as u8;
        }
    }
    Pixmap::from_vec(premultiplied, tiny_skia::IntSize::from_wh(width, height)?)
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
