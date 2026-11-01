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
    let html = cellpadding_to_css(&preprocess_attrs(&raw));
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

/// litehtml ignores `cellpadding`, which `preprocess_attrs` has turned into `data-cellpadding`,
/// so each value used gets a rule padding the cells of tables carrying it. The markup is left
/// alone: an added `class` attribute would lose to the mail's own and drop its classes. Unlike
/// the browser's presentational hint, the rule outranks author `td` rules.
fn cellpadding_to_css(html: &str) -> String {
    const ATTRIBUTE: &str = "data-cellpadding=\"";
    let mut paddings: Vec<u32> = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.find(ATTRIBUTE) {
        rest = &rest[start + ATTRIBUTE.len()..];
        let digits: String = rest.chars().take_while(|character| character.is_ascii_digit()).collect();
        let Ok(padding) = digits.parse() else {
            continue;
        };
        if !paddings.contains(&padding) {
            paddings.push(padding);
        }
    }
    if paddings.is_empty() {
        return html.to_string();
    }
    let rules: String = paddings.iter().map(|padding| cellpadding_rule(*padding)).collect();
    format!("<style>{rules}</style>{html}")
}

fn cellpadding_rule(padding: u32) -> String {
    let table = format!("table[data-cellpadding=\"{padding}\"]");
    format!(
        "{table} > tbody > tr > td, {table} > tbody > tr > th, {table} > tr > td \
         {{ padding: {padding}px; }}\n"
    )
}
