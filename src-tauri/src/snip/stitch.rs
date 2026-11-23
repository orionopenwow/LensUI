//! Scrolling capture: stitches successive frames of a scrolled window into one tall image.
//!
//! Each frame is compared row by row with the previous one. Rows that did not move (a sticky
//! header at the top, a footer or status bar at the bottom) are detected first and kept once; the
//! scroll distance is then the vertical offset at which the moving middle of the new frame best
//! matches the old one. Rows are compared by hash over the middle 85 % of the width, so a moving
//! scrollbar thumb at the right edge doesn't break matching.

/// An RGBA image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Img {
    pub w: u32,
    pub h: u32,
    pub px: Vec<u8>,
}

impl Img {
    pub fn new(w: u32, h: u32) -> Self {
        Self { w, h, px: vec![0; (w * h * 4) as usize] }
    }
    pub fn row(&self, y: u32) -> &[u8] {
        let s = (y * self.w * 4) as usize;
        &self.px[s..s + (self.w * 4) as usize]
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Push {
    /// The frame was appended; the window scrolled this many rows.
    Appended(u32),
    /// Nothing moved: the end of the page was reached.
    End,
    /// No overlap found (scrolled too far or content changed); the frame was not used.
    NoOverlap,
}

/// Hash of the middle part of a row (FNV-1a).
fn row_hash(img: &Img, y: u32) -> u64 {
    let row = img.row(y);
    let w = img.w as usize;
    let lo = w * 5 / 100;
    let hi = (w * 90 / 100).max(lo + 1).min(w);
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in &row[lo * 4..hi * 4] {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

fn hashes(img: &Img) -> Vec<u64> {
    (0..img.h).map(|y| row_hash(img, y)).collect()
}

/// Finds the scroll offset between two equally sized frames.
///
/// Returns `(top_static, bottom_static, dy)`: rows unchanged at the top and bottom, and the scroll
/// distance of the middle (`Some(0)` when nothing moved, `None` when no good match exists).
pub fn find_offset(prev: &Img, next: &Img, min_overlap: u32) -> (u32, u32, Option<u32>) {
    if prev.w != next.w || prev.h != next.h || prev.h == 0 {
        return (0, 0, None);
    }
    let a = hashes(prev);
    let b = hashes(next);
    let h = a.len();
    if a == b {
        return (0, 0, Some(0));
    }
    let mut top = 0;
    while top < h && a[top] == b[top] {
        top += 1;
    }
    let mut bot = 0;
    while bot < h - top && a[h - 1 - bot] == b[h - 1 - bot] {
        bot += 1;
    }
    let mid = h - top - bot;
    if mid == 0 {
        return (top as u32, bot as u32, Some(0));
    }
    let mut best: Option<(u32, f64)> = None;
    for dy in 1..mid {
        let len = mid - dy;
        if (len as u32) < min_overlap {
            break;
        }
        let matches = (0..len).filter(|i| a[top + i + dy] == b[top + i]).count();
        let score = matches as f64 / len as f64;
        // Uniform rows (blank space) match everywhere; demand a high score and prefer small dy.
        if score >= 0.92 && best.map(|(_, s)| score > s + 1e-9).unwrap_or(true) {
            best = Some((dy as u32, score));
        }
    }
    (top as u32, bot as u32, best.map(|(d, _)| d))
}

/// Builds the tall image frame by frame.
pub struct Stitcher {
    w: u32,
    header: Vec<u8>,
    body: Vec<u8>,
    footer: Vec<u8>,
    last: Option<Img>,
    pub max_height: u32,
}

impl Stitcher {
    pub fn new(max_height: u32) -> Self {
        Self { w: 0, header: Vec::new(), body: Vec::new(), footer: Vec::new(), last: None, max_height }
    }

    fn height(&self) -> u32 {
        if self.w == 0 {
            return 0;
        }
        ((self.header.len() + self.body.len() + self.footer.len()) / (self.w as usize * 4)) as u32
    }

    pub fn push(&mut self, frame: Img) -> Push {
        let Some(prev) = self.last.take() else {
            self.w = frame.w;
            self.body = frame.px.clone();
            self.last = Some(frame);
            return Push::Appended(0);
        };
        let (top, bot, dy) = find_offset(&prev, &frame, 8);
        let res = match dy {
            Some(0) => Push::End,
            None => Push::NoOverlap,
            Some(dy) => {
                let row = (frame.w * 4) as usize;
                if self.header.is_empty() && self.footer.is_empty() && (top > 0 || bot > 0) {
                    // First real scroll: split the first frame into header / body / footer.
                    let body = std::mem::take(&mut self.body);
                    self.header = body[..top as usize * row].to_vec();
                    self.footer = body[body.len() - bot as usize * row..].to_vec();
                    self.body = body[top as usize * row..body.len() - bot as usize * row].to_vec();
                }
                let new_from = (frame.h - bot - dy) as usize * row;
                let new_to = (frame.h - bot) as usize * row;
                self.body.extend_from_slice(&frame.px[new_from..new_to]);
                if bot > 0 {
                    self.footer = frame.px[(frame.h - bot) as usize * row..].to_vec();
                }
                Push::Appended(dy)
            }
        };
        if res == Push::NoOverlap {
            self.last = Some(prev);
        } else {
            self.last = Some(frame);
        }
        if self.height() > self.max_height {
            let row = (self.w * 4) as usize;
            let keep = (self.max_height as usize).saturating_sub((self.header.len() + self.footer.len()) / row) * row;
            self.body.truncate(keep);
            return Push::End;
        }
        res
    }

    pub fn finish(self) -> Img {
        let mut px = self.header;
        px.extend_from_slice(&self.body);
        px.extend_from_slice(&self.footer);
        let h = if self.w == 0 { 0 } else { (px.len() / (self.w as usize * 4)) as u32 };
        Img { w: self.w, h, px }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tall "page" whose every row has a distinct pattern.
    fn page(w: u32, h: u32, seed: u64) -> Img {
        let mut img = Img::new(w, h);
        let mut s = seed;
        for y in 0..h {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            for x in 0..w {
                let i = ((y * w + x) * 4) as usize;
                img.px[i] = (s >> (x % 56)) as u8;
                img.px[i + 1] = (y % 251) as u8;
                img.px[i + 2] = (x as u8).wrapping_mul(3);
                img.px[i + 3] = 255;
            }
        }
        img
    }

    fn view(p: &Img, header: &Img, footer: &Img, offset: u32, vh: u32) -> Img {
        let w = p.w;
        let mut out = Img::new(w, vh);
        let row = (w * 4) as usize;
        out.px[..header.px.len()].copy_from_slice(&header.px);
        let body_h = vh - header.h - footer.h;
        let src = (offset * w * 4) as usize;
        out.px[header.px.len()..header.px.len() + body_h as usize * row].copy_from_slice(&p.px[src..src + body_h as usize * row]);
        out.px[(vh - footer.h) as usize * row..].copy_from_slice(&footer.px);
        out
    }

    #[test]
    fn reconstructs_page_with_sticky_header_and_footer() {
        let w = 64;
        let body = page(w, 900, 99);
        let header = page(w, 20, 7);
        let footer = page(w, 12, 3);
        let vh = 200;
        let body_view = vh - 32;
        let mut st = Stitcher::new(10_000);
        let mut offset = 0;
        let steps = [50, 73, 120, 31, 160, 99];
        assert_eq!(st.push(view(&body, &header, &footer, 0, vh)), Push::Appended(0));
        for s in steps {
            let next = (offset + s).min(900 - body_view);
            let r = st.push(view(&body, &header, &footer, next, vh));
            if next == offset {
                assert_eq!(r, Push::End);
            } else {
                assert_eq!(r, Push::Appended(next - offset));
            }
            offset = next;
        }
        // Scrolling once more at the end changes nothing.
        assert_eq!(st.push(view(&body, &header, &footer, offset, vh)), Push::End);
        let out = st.finish();
        let want_h = 20 + offset + body_view + 12;
        assert_eq!(out.h, want_h);
        assert_eq!(&out.px[..header.px.len()], &header.px[..]);
        let row = (w * 4) as usize;
        let body_len = (offset + body_view) as usize * row;
        assert_eq!(&out.px[header.px.len()..header.px.len() + body_len], &body.px[..body_len]);
        assert_eq!(&out.px[out.px.len() - footer.px.len()..], &footer.px[..]);
    }

    #[test]
    fn plain_page_without_sticky_rows() {
        let body = page(40, 500, 5);
        let empty = Img::new(40, 0);
        let mut st = Stitcher::new(10_000);
        st.push(view(&body, &empty, &empty, 0, 100));
        assert_eq!(st.push(view(&body, &empty, &empty, 60, 100)), Push::Appended(60));
        assert_eq!(st.push(view(&body, &empty, &empty, 130, 100)), Push::Appended(70));
        let out = st.finish();
        assert_eq!(out.h, 230);
        assert_eq!(out.px, body.px[..(230 * 40 * 4) as usize].to_vec());
    }

    #[test]
    fn jump_too_far_is_rejected() {
        let body = page(40, 600, 11);
        let empty = Img::new(40, 0);
        let mut st = Stitcher::new(10_000);
        st.push(view(&body, &empty, &empty, 0, 100));
        assert_eq!(st.push(view(&body, &empty, &empty, 300, 100)), Push::NoOverlap);
        // The next good frame still stitches against the last used one.
        assert_eq!(st.push(view(&body, &empty, &empty, 40, 100)), Push::Appended(40));
    }

    #[test]
    fn height_cap_stops_capture() {
        let body = page(16, 2000, 13);
        let empty = Img::new(16, 0);
        let mut st = Stitcher::new(300);
        st.push(view(&body, &empty, &empty, 0, 100));
        let mut off = 0;
        let mut ended = false;
        for _ in 0..20 {
            off += 80;
            if st.push(view(&body, &empty, &empty, off, 100)) == Push::End {
                ended = true;
                break;
            }
        }
        assert!(ended);
        assert!(st.finish().h <= 300);
    }
}
