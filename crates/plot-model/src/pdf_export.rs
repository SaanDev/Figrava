//! Pure-Rust vector PDF 1.4 generator for `PlotDocument`.
//!
//! Produces publication-quality vector PDF files with exact physical dimensions
//! ($1\text{ cm} = 28.3464567\text{ pt}$) directly from the renderer-independent plot model.

use crate::{LineStyle, PlotDocument, PlotType, SymbolShape};
use scientific_core::ScientificResult;
use serde::{Deserialize, Serialize};
use std::fmt::Write as _;

const PT_PER_CM: f64 = 28.346_456_7;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfSeriesData {
    pub label: String,
    pub plot_type: PlotType,
    pub color_hex: String,
    pub line_width: f64,
    pub line_style: LineStyle,
    pub symbol_shape: SymbolShape,
    pub symbol_size: f64,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub y_err: Option<Vec<f64>>,
}

fn hex_to_rgb01(hex: &str) -> (f64, f64, f64) {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() == 6 {
        let r = u8::from_str_radix(&clean[0..2], 16).unwrap_or(0) as f64 / 255.0;
        let g = u8::from_str_radix(&clean[2..4], 16).unwrap_or(114) as f64 / 255.0;
        let b = u8::from_str_radix(&clean[4..6], 16).unwrap_or(178) as f64 / 255.0;
        (r, g, b)
    } else {
        (0.0, 0.447, 0.698)
    }
}

fn escape_pdf_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '(' => out.push_str("\\("),
            ')' => out.push_str("\\)"),
            '\\' => out.push_str("\\\\"),
            c if c.is_ascii() && !c.is_ascii_control() => out.push(c),
            _ => out.push('?'),
        }
    }
    out
}

/// Renders a `PlotDocument` and its resolved `PdfSeriesData` layers into a standalone
/// vector PDF 1.4 byte vector with physical dimensions in centimeters.
pub fn render_plot_to_pdf_bytes(
    plot: &PlotDocument,
    series_list: &[PdfSeriesData],
) -> ScientificResult<Vec<u8>> {
    let width_pt = (plot.dimensions.width_cm.max(4.0) * PT_PER_CM).round();
    let height_pt = (plot.dimensions.height_cm.max(3.0) * PT_PER_CM).round();

    let margin_left = 58.0;
    let margin_right = 28.0;
    let margin_bottom = 48.0;
    let margin_top = 44.0;

    let plot_x0 = margin_left;
    let plot_y0 = margin_bottom;
    let plot_w = (width_pt - margin_left - margin_right).max(50.0);
    let plot_h = (height_pt - margin_top - margin_bottom).max(40.0);

    let panel = plot.primary_panel();

    // Determine data bounds across all visible series
    let mut min_x = panel.x_axis.min.unwrap_or(f64::INFINITY);
    let mut max_x = panel.x_axis.max.unwrap_or(f64::NEG_INFINITY);
    let mut min_y = panel.y_axis.min.unwrap_or(f64::INFINITY);
    let mut max_y = panel.y_axis.max.unwrap_or(f64::NEG_INFINITY);

    if panel.x_axis.min.is_none() || panel.x_axis.max.is_none() {
        for s in series_list {
            for &xv in &s.x {
                if xv.is_finite() {
                    if panel.x_axis.min.is_none() && xv < min_x {
                        min_x = xv;
                    }
                    if panel.x_axis.max.is_none() && xv > max_x {
                        max_x = xv;
                    }
                }
            }
        }
    }
    if panel.y_axis.min.is_none() || panel.y_axis.max.is_none() {
        for s in series_list {
            for (idx, &yv) in s.y.iter().enumerate() {
                if yv.is_finite() {
                    let err = s
                        .y_err
                        .as_ref()
                        .and_then(|e| e.get(idx))
                        .copied()
                        .unwrap_or(0.0);
                    if panel.y_axis.min.is_none() && (yv - err) < min_y {
                        min_y = yv - err;
                    }
                    if panel.y_axis.max.is_none() && (yv + err) > max_y {
                        max_y = yv + err;
                    }
                }
            }
        }
    }

    if !min_x.is_finite() || !max_x.is_finite() || (max_x - min_x).abs() < 1e-12 {
        min_x = 0.0;
        max_x = 10.0;
    }
    if !min_y.is_finite() || !max_y.is_finite() || (max_y - min_y).abs() < 1e-12 {
        min_y = 0.0;
        max_y = 10.0;
    }

    // Pad Y range by 5% if auto-scaled
    if panel.y_axis.min.is_none() && panel.y_axis.max.is_none() {
        let pad = 0.05 * (max_y - min_y);
        min_y -= pad;
        max_y += pad;
    }

    let map_x = |x: f64| -> f64 {
        let t = ((x - min_x) / (max_x - min_x)).clamp(0.0, 1.0);
        let t = if panel.x_axis.reversed { 1.0 - t } else { t };
        plot_x0 + t * plot_w
    };
    let map_y = |y: f64| -> f64 {
        let t = ((y - min_y) / (max_y - min_y)).clamp(0.0, 1.0);
        let t = if panel.y_axis.reversed { 1.0 - t } else { t };
        plot_y0 + t * plot_h
    };

    let mut stream = String::with_capacity(8192);

    // 1. Background fill if not transparent
    if !plot.export_spec.transparent_background {
        let (br, bg, bb) = hex_to_rgb01(&plot.background_color);
        let _ = writeln!(
            stream,
            "{br:.3} {bg:.3} {bb:.3} rg 0 0 {width_pt:.2} {height_pt:.2} re f"
        );
    }

    // 2. Grid lines (5 divisions)
    if panel.x_axis.show_major_grid || panel.y_axis.show_major_grid {
        let _ = writeln!(stream, "q 0.88 0.90 0.93 RG 0.5 w [2 2] 0 d");
        if panel.x_axis.show_major_grid {
            for i in 1..5 {
                let gx = plot_x0 + plot_w * (i as f64) / 5.0;
                let _ = writeln!(
                    stream,
                    "{gx:.2} {plot_y0:.2} m {gx:.2} {:.2} l S",
                    plot_y0 + plot_h
                );
            }
        }
        if panel.y_axis.show_major_grid {
            for i in 1..5 {
                let gy = plot_y0 + plot_h * (i as f64) / 5.0;
                let _ = writeln!(
                    stream,
                    "{plot_x0:.2} {gy:.2} m {:.2} {gy:.2} l S",
                    plot_x0 + plot_w
                );
            }
        }
        let _ = writeln!(stream, "Q");
    }

    // 3. Plot frame & ticks
    let _ = writeln!(
        stream,
        "q 0.15 0.20 0.28 RG 1.0 w {plot_x0:.2} {plot_y0:.2} {plot_w:.2} {plot_h:.2} re S Q"
    );

    // Tick marks and numeric labels
    for i in 0..=5 {
        let frac = (i as f64) / 5.0;
        let tx = plot_x0 + frac * plot_w;
        let ty = plot_y0 + frac * plot_h;
        let xv = min_x + frac * (max_x - min_x);
        let yv = min_y + frac * (max_y - min_y);

        // Inward ticks
        let _ = writeln!(
            stream,
            "0.15 0.20 0.28 RG 0.8 w {tx:.2} {plot_y0:.2} m {tx:.2} {:.2} l S",
            plot_y0 + 4.0
        );
        let _ = writeln!(
            stream,
            "{plot_x0:.2} {ty:.2} m {:.2} {ty:.2} l S",
            plot_x0 + 4.0
        );

        let x_lbl = escape_pdf_text(&format!("{xv:.4}"));
        let y_lbl = escape_pdf_text(&format!("{yv:.4}"));
        let _ = writeln!(
            stream,
            "BT /F1 8 Tf 0.15 0.20 0.28 rg {:.2} {:.2} Td ({x_lbl}) Tj ET",
            tx - 10.0,
            plot_y0 - 12.0
        );
        let _ = writeln!(
            stream,
            "BT /F1 8 Tf 0.15 0.20 0.28 rg {:.2} {:.2} Td ({y_lbl}) Tj ET",
            plot_x0 - 36.0,
            ty - 3.0
        );
    }

    // 4. Title & Axis labels
    let title_text = escape_pdf_text(&plot.title);
    let _ = writeln!(
        stream,
        "BT /F1 12 Tf 0.06 0.09 0.16 rg {:.2} {:.2} Td ({title_text}) Tj ET",
        plot_x0 + plot_w * 0.22,
        height_pt - 22.0
    );

    let x_title = match &panel.x_axis.unit {
        Some(u) if !u.is_empty() => format!("{} [{}]", panel.x_axis.title, u),
        _ => panel.x_axis.title.clone(),
    };
    let y_title = match &panel.y_axis.unit {
        Some(u) if !u.is_empty() => format!("{} [{}]", panel.y_axis.title, u),
        _ => panel.y_axis.title.clone(),
    };

    let _ = writeln!(
        stream,
        "BT /F1 10 Tf 0.06 0.09 0.16 rg {:.2} {:.2} Td ({}) Tj ET",
        plot_x0 + plot_w * 0.38,
        14.0,
        escape_pdf_text(&x_title)
    );
    // Rotated Y-axis label (90 degrees counter-clockwise)
    let _ = writeln!(
        stream,
        "BT /F1 10 Tf 0.06 0.09 0.16 rg 0 1 -1 0 16.0 {:.2} Tm ({}) Tj ET",
        plot_y0 + plot_h * 0.35,
        escape_pdf_text(&y_title)
    );

    // 5. Series rendering (clipped to plot frame)
    let _ = writeln!(
        stream,
        "q {plot_x0:.2} {plot_y0:.2} {plot_w:.2} {plot_h:.2} re W n"
    );

    for series in series_list {
        let (r, g, b) = hex_to_rgb01(&series.color_hex);
        let n = series.x.len().min(series.y.len());
        if n == 0 {
            continue;
        }

        // Error bars if present
        if let Some(errs) = &series.y_err {
            let _ = writeln!(stream, "q {r:.3} {g:.3} {b:.3} RG 0.8 w");
            for (i, &ev) in errs.iter().enumerate().take(n) {
                let xv = series.x[i];
                let yv = series.y[i];
                if xv.is_finite() && yv.is_finite() && ev.is_finite() && ev > 0.0 {
                    let px = map_x(xv);
                    let py_lo = map_y(yv - ev);
                    let py_hi = map_y(yv + ev);
                    let _ = writeln!(
                        stream,
                        "{px:.2} {py_lo:.2} m {px:.2} {py_hi:.2} l {:.2} {py_lo:.2} m {:.2} {py_lo:.2} l {:.2} {py_hi:.2} m {:.2} {py_hi:.2} l S",
                        px - 2.5,
                        px + 2.5,
                        px - 2.5,
                        px + 2.5
                    );
                }
            }
            let _ = writeln!(stream, "Q");
        }

        // Line / Polyline path
        if matches!(
            series.plot_type,
            PlotType::Line | PlotType::LineSymbols | PlotType::Area
        ) {
            let dash = match series.line_style {
                LineStyle::Solid => "[] 0 d",
                LineStyle::Dashed | LineStyle::DashDot => "[5 3] 0 d",
                LineStyle::Dotted => "[1.5 2] 0 d",
            };
            let lw = (series.line_width * 0.75).max(0.5);
            let _ = writeln!(stream, "q {r:.3} {g:.3} {b:.3} RG {lw:.2} w {dash}");
            let mut started = false;
            for i in 0..n {
                let xv = series.x[i];
                let yv = series.y[i];
                if xv.is_finite() && yv.is_finite() {
                    let px = map_x(xv);
                    let py = map_y(yv);
                    if !started {
                        let _ = write!(stream, "{px:.2} {py:.2} m ");
                        started = true;
                    } else {
                        let _ = write!(stream, "{px:.2} {py:.2} l ");
                    }
                }
            }
            if started {
                let _ = writeln!(stream, "S");
            }
            let _ = writeln!(stream, "Q");
        }

        // Symbols
        if matches!(series.plot_type, PlotType::Scatter | PlotType::LineSymbols)
            && series.symbol_shape != SymbolShape::None
        {
            let rad = (series.symbol_size * 0.35).clamp(1.5, 6.0);
            let _ = writeln!(stream, "q {r:.3} {g:.3} {b:.3} rg {r:.3} {g:.3} {b:.3} RG");
            for i in 0..n {
                let xv = series.x[i];
                let yv = series.y[i];
                if xv.is_finite() && yv.is_finite() {
                    let px = map_x(xv);
                    let py = map_y(yv);
                    let _ = writeln!(
                        stream,
                        "{:.2} {:.2} {:.2} {:.2} re f",
                        px - rad,
                        py - rad,
                        rad * 2.0,
                        rad * 2.0
                    );
                }
            }
            let _ = writeln!(stream, "Q");
        }
    }

    let _ = writeln!(stream, "Q"); // End clip

    // 6. Legend box
    if plot.legend.visible && !series_list.is_empty() {
        let leg_x = plot_x0 + plot_w - 135.0;
        let mut leg_y = plot_y0 + plot_h - 16.0;
        for s in series_list {
            let (r, g, b) = hex_to_rgb01(&s.color_hex);
            let _ = writeln!(
                stream,
                "q {r:.3} {g:.3} {b:.3} rg {:.2} {:.2} 8 4 re f Q",
                leg_x, leg_y
            );
            let _ = writeln!(
                stream,
                "BT /F1 8 Tf 0.10 0.12 0.16 rg {:.2} {:.2} Td ({}) Tj ET",
                leg_x + 12.0,
                leg_y - 1.0,
                escape_pdf_text(&s.label)
            );
            leg_y -= 12.0;
        }
    }

    // Assemble valid ISO 32000-1 PDF 1.4 file with cross-reference table
    let stream_bytes = stream.as_bytes();
    let mut pdf = Vec::with_capacity(stream_bytes.len() + 1024);
    let mut offsets = Vec::new();

    pdf.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    let push_obj = |pdf: &mut Vec<u8>, offsets: &mut Vec<usize>, id: usize, body: &[u8]| {
        offsets.push(pdf.len());
        let header = format!("{id} 0 obj\n");
        pdf.extend_from_slice(header.as_bytes());
        pdf.extend_from_slice(body);
        pdf.extend_from_slice(b"\nendobj\n");
    };

    push_obj(
        &mut pdf,
        &mut offsets,
        1,
        b"<< /Type /Catalog /Pages 2 0 R >>",
    );
    push_obj(
        &mut pdf,
        &mut offsets,
        2,
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    );
    let page_obj = format!(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width_pt:.2} {height_pt:.2}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
    );
    push_obj(&mut pdf, &mut offsets, 3, page_obj.as_bytes());

    let mut content_obj = Vec::new();
    let content_hdr = format!("<< /Length {} >>\nstream\n", stream_bytes.len());
    content_obj.extend_from_slice(content_hdr.as_bytes());
    content_obj.extend_from_slice(stream_bytes);
    content_obj.extend_from_slice(b"endstream");
    push_obj(&mut pdf, &mut offsets, 4, &content_obj);

    push_obj(
        &mut pdf,
        &mut offsets,
        5,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    );

    let xref_offset = pdf.len();
    let xref_header = format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len() + 1);
    pdf.extend_from_slice(xref_header.as_bytes());
    for off in &offsets {
        let line = format!("{off:010} 00000 n \n");
        pdf.extend_from_slice(line.as_bytes());
    }

    let trailer = format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
        offsets.len() + 1
    );
    pdf.extend_from_slice(trailer.as_bytes());

    Ok(pdf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_valid_vector_pdf_document() {
        let doc = PlotDocument::new("UV-Vis Absorption Spectrum");
        let series = vec![PdfSeriesData {
            label: "Sample A".to_string(),
            plot_type: PlotType::LineSymbols,
            color_hex: "#0072B2".to_string(),
            line_width: 2.0,
            line_style: LineStyle::Solid,
            symbol_shape: SymbolShape::Circle,
            symbol_size: 6.0,
            x: vec![400.0, 450.0, 500.0, 550.0],
            y: vec![0.12, 0.48, 0.85, 0.31],
            y_err: Some(vec![0.02, 0.03, 0.04, 0.02]),
        }];

        let bytes = render_plot_to_pdf_bytes(&doc, &series).expect("pdf export");
        assert!(bytes.starts_with(b"%PDF-1.4"));
        assert!(bytes.ends_with(b"%%EOF\n"));
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("(UV-Vis Absorption Spectrum)"));
    }
}
