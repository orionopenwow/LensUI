//! Text recognition with Windows OCR (`Windows.Media.Ocr`), using the OCR language packs installed
//! on this PC — the same engine PowerToys Text Extractor uses. Images larger than the engine's
//! limit are scaled down first and the word boxes scaled back up.

use serde::Serialize;

use super::geom::Rect;
use super::redact::{OcrLine, OcrWord};
use super::stitch::Img;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub language: String,
    pub text: String,
    pub lines: Vec<OcrLine>,
}

/// Joins recognised lines into plain text.
pub fn text_of(lines: &[OcrLine]) -> String {
    lines
        .iter()
        .map(|l| l.words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(windows)]
pub fn recognize(img: &Img, language: &str) -> Result<OcrResult, String> {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let err = |e: windows::core::Error| e.message().to_string();
    let engine = if language == "auto" || language.is_empty() {
        OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| "No Windows OCR language pack is installed for your languages.".to_string())?
    } else {
        let lang = Language::CreateLanguage(&HSTRING::from(language)).map_err(err)?;
        OcrEngine::TryCreateFromLanguage(&lang).map_err(|_| format!("The OCR language pack for {language} isn't installed."))?
    };
    let max = OcrEngine::MaxImageDimension().unwrap_or(10_000).max(100);
    let scale = (img.w.max(img.h) as f64 / max as f64).max(1.0);
    let small;
    let src = if scale > 1.0 {
        small = super::image::thumbnail(img, max);
        &small
    } else {
        img
    };
    // RGBA → BGRA for SoftwareBitmap.
    let mut bgra = src.px.clone();
    for p in bgra.chunks_exact_mut(4) {
        p.swap(0, 2);
    }
    let writer = DataWriter::new().map_err(err)?;
    writer.WriteBytes(&bgra).map_err(err)?;
    let buffer = writer.DetachBuffer().map_err(err)?;
    let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(&buffer, BitmapPixelFormat::Bgra8, src.w as i32, src.h as i32, BitmapAlphaMode::Premultiplied)
        .map_err(err)?;
    let result = engine.RecognizeAsync(&bitmap).map_err(err)?.get().map_err(err)?;
    let mut lines = Vec::new();
    for line in result.Lines().map_err(err)? {
        let mut words = Vec::new();
        for w in line.Words().map_err(err)? {
            let r = w.BoundingRect().map_err(err)?;
            words.push(OcrWord {
                text: w.Text().map_err(err)?.to_string(),
                rect: Rect::new(
                    (r.X as f64 * scale).floor() as i32,
                    (r.Y as f64 * scale).floor() as i32,
                    (r.Width as f64 * scale).ceil() as i32,
                    (r.Height as f64 * scale).ceil() as i32,
                ),
            });
        }
        if !words.is_empty() {
            lines.push(OcrLine { words });
        }
    }
    let language = engine.RecognizerLanguage().and_then(|l| l.LanguageTag()).map(|t| t.to_string()).unwrap_or_default();
    Ok(OcrResult { language, text: text_of(&lines), lines })
}

#[cfg(not(windows))]
pub fn recognize(_img: &Img, _language: &str) -> Result<OcrResult, String> {
    Err("Text recognition uses Windows OCR and is only available on Windows.".into())
}

/// OCR languages installed on this PC (BCP-47 tags).
#[cfg(windows)]
pub fn languages() -> Vec<String> {
    use windows::Media::Ocr::OcrEngine;
    OcrEngine::AvailableRecognizerLanguages()
        .map(|v| v.into_iter().filter_map(|l| l.LanguageTag().ok().map(|t| t.to_string())).collect())
        .unwrap_or_default()
}

#[cfg(not(windows))]
pub fn languages() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_lines() {
        let w = |t: &str| OcrWord { text: t.into(), rect: Rect::default() };
        let lines = vec![OcrLine { words: vec![w("Hello"), w("world")] }, OcrLine { words: vec![w("Two")] }];
        assert_eq!(text_of(&lines), "Hello world\nTwo");
    }
}
