//! Audio helpers for 16 kHz mono speech: levels, a voice-activity detector and WAV encoding.
//! Standard library only.

pub const SAMPLE_RATE: u32 = 16_000;
/// 20 ms frames.
pub const FRAME: usize = 320;

/// RMS level of a frame in dBFS (−100 for silence).
pub fn dbfs(frame: &[i16]) -> f32 {
    if frame.is_empty() {
        return -100.0;
    }
    let sum: f64 = frame.iter().map(|&s| (s as f64) * (s as f64)).sum();
    let rms = (sum / frame.len() as f64).sqrt() / 32768.0;
    if rms <= 1e-5 {
        -100.0
    } else {
        (20.0 * rms.log10()) as f32
    }
}

/// 0..1 meter value for the HUD (−60 dBFS → 0, −10 dBFS → 1).
pub fn meter(db: f32) -> f32 {
    ((db + 60.0) / 50.0).clamp(0.0, 1.0)
}

/// A 16-bit mono PCM WAV file.
pub fn wav(samples: &[i16], rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

/// Reads the samples of a 16-bit mono WAV (for bench fixtures). Returns (rate, samples).
#[cfg(test)]
pub fn read_wav(bytes: &[u8]) -> Option<(u32, Vec<i16>)> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut i = 12;
    let (mut rate, mut channels, mut bits) = (0u32, 0u16, 0u16);
    while i + 8 <= bytes.len() {
        let id = &bytes[i..i + 4];
        let len = u32::from_le_bytes(bytes[i + 4..i + 8].try_into().ok()?) as usize;
        let body = bytes.get(i + 8..i + 8 + len)?;
        if id == b"fmt " && len >= 16 {
            channels = u16::from_le_bytes(body[2..4].try_into().ok()?);
            rate = u32::from_le_bytes(body[4..8].try_into().ok()?);
            bits = u16::from_le_bytes(body[14..16].try_into().ok()?);
        } else if id == b"data" {
            if bits != 16 || channels == 0 {
                return None;
            }
            let step = channels as usize * 2;
            let samples = body.chunks_exact(step).map(|c| i16::from_le_bytes([c[0], c[1]])).collect();
            return Some((rate, samples));
        }
        i += 8 + len + (len & 1);
    }
    None
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VadEvent {
    SpeechStart,
    SpeechEnd,
}

/// Energy VAD with an adaptive noise floor. Cheap enough to run on every 20 ms frame; good for
/// "is someone talking" gating. (whisper.cpp's Silero VAD then trims inside the recogniser.)
#[derive(Debug, Clone)]
pub struct Vad {
    /// Tracked background level (dBFS).
    pub floor: f32,
    /// dB above the floor that counts as speech (lower = more sensitive).
    pub margin: f32,
    /// Absolute minimum level for speech.
    pub min_db: f32,
    /// Speech frames needed to start (debounces clicks).
    pub onset_frames: u32,
    /// Silent frames needed to end (lets people pause between words).
    pub hangover_frames: u32,
    speaking: bool,
    run: u32,
    /// Frames left in the start-up calibration (learns the room before detecting).
    calibrating: u32,
}

impl Vad {
    /// `sensitivity` 0..1 (0.5 default): 0 needs loud speech, 1 picks up quiet voices.
    pub fn new(sensitivity: f32) -> Self {
        let s = sensitivity.clamp(0.0, 1.0);
        Vad {
            floor: -60.0,
            margin: 18.0 - 10.0 * s,
            min_db: -42.0 - 10.0 * s,
            onset_frames: 3,
            hangover_frames: 35, // 700 ms
            speaking: false,
            run: 0,
            calibrating: 15, // 300 ms
        }
    }

    /// Whether a frame this loud counts as speech right now (doesn't change any state).
    pub fn loud(&self, db: f32) -> bool {
        self.calibrating == 0 && db > self.floor + self.margin && db > self.min_db
            || self.calibrating > 0 && db > self.min_db + 12.0
    }

    /// Feeds one frame's level; returns an event when speech starts or ends.
    pub fn push(&mut self, db: f32) -> Option<VadEvent> {
        let db = db.max(-90.0);
        if self.calibrating > 0 {
            // Learn the room: average the first frames into the floor.
            let n = 16 - self.calibrating;
            self.floor = if n == 1 { db } else { self.floor + (db - self.floor) / n as f32 };
            self.calibrating -= 1;
            return None;
        }
        // Creep upwards slowly even while loud, so a fan that starts later stops counting as speech.
        if db > self.floor {
            self.floor += 0.01;
        }
        let loud = db > self.floor + self.margin && db > self.min_db;
        if !loud {
            // Track the floor quickly downwards, slowly upwards.
            let k = if db < self.floor { 0.2 } else { 0.02 };
            self.floor += (db - self.floor) * k;
        }
        if self.speaking {
            if loud {
                self.run = 0;
            } else {
                self.run += 1;
                if self.run >= self.hangover_frames {
                    self.speaking = false;
                    self.run = 0;
                    return Some(VadEvent::SpeechEnd);
                }
            }
        } else if loud {
            self.run += 1;
            if self.run >= self.onset_frames {
                self.speaking = true;
                self.run = 0;
                return Some(VadEvent::SpeechStart);
            }
        } else {
            self.run = 0;
        }
        None
    }

    pub fn reset(&mut self) {
        self.speaking = false;
        self.run = 0;
    }

    /// Re-learn the room (new microphone, resumed after a pause).
    pub fn recalibrate(&mut self) {
        self.reset();
        self.calibrating = 15;
    }
}

/// Keeps the last `cap` samples (pre-roll, so the first syllable isn't clipped).
#[derive(Debug, Clone)]
pub struct Ring {
    buf: std::collections::VecDeque<i16>,
    cap: usize,
}

impl Ring {
    pub fn new(cap: usize) -> Self {
        Ring { buf: std::collections::VecDeque::with_capacity(cap), cap }
    }
    pub fn push(&mut self, s: &[i16]) {
        for &x in s {
            if self.buf.len() == self.cap {
                self.buf.pop_front();
            }
            self.buf.push_back(x);
        }
    }
    pub fn take(&mut self) -> Vec<i16> {
        self.buf.drain(..).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(amp: f32, frames: usize, seed: &mut u32) -> Vec<Vec<i16>> {
        (0..frames)
            .map(|f| {
                (0..FRAME)
                    .map(|i| {
                        *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                        let noise = ((*seed >> 16) as f32 / 65536.0 - 0.5) * 300.0;
                        let t = (f * FRAME + i) as f32 / SAMPLE_RATE as f32;
                        (amp * (2.0 * std::f32::consts::PI * 220.0 * t).sin() + noise) as i16
                    })
                    .collect()
            })
            .collect()
    }

    #[test]
    fn levels() {
        assert_eq!(dbfs(&[0; 320]), -100.0);
        let full: Vec<i16> = (0..320).map(|i| if i % 2 == 0 { 32767 } else { -32767 }).collect();
        assert!(dbfs(&full) > -0.1);
        assert_eq!(meter(-100.0), 0.0);
        assert_eq!(meter(0.0), 1.0);
    }

    #[test]
    fn vad_finds_speech_in_noise() {
        let mut seed = 7;
        let mut vad = Vad::new(0.5);
        let mut events = Vec::new();
        let mut frame_no = 0;
        for (amp, n) in [(0.0, 50), (6000.0, 40), (0.0, 60), (6000.0, 2), (0.0, 30)] {
            for f in tone(amp, n, &mut seed) {
                if let Some(e) = vad.push(dbfs(&f)) {
                    events.push((e, frame_no));
                }
                frame_no += 1;
            }
        }
        // One utterance: starts ~3 frames in, ends after the 700 ms hangover; the 40 ms click is ignored.
        assert_eq!(events.len(), 2, "{:?}", events);
        assert_eq!(events[0].0, VadEvent::SpeechStart);
        assert!((52..=54).contains(&events[0].1));
        assert_eq!(events[1].0, VadEvent::SpeechEnd);
        assert!((124..=126).contains(&events[1].1), "{:?}", events);
    }

    #[test]
    fn vad_adapts_to_a_noisy_room() {
        let mut seed = 3;
        let mut vad = Vad::new(0.5);
        // Steady fan noise well above silence must not count as speech.
        for f in tone(900.0, 200, &mut seed) {
            assert_eq!(vad.push(dbfs(&f)), None);
        }
        assert!(vad.floor > -40.0);
        // A voice clearly above it still does.
        let mut started = false;
        for f in tone(12_000.0, 10, &mut seed) {
            started |= vad.push(dbfs(&f)) == Some(VadEvent::SpeechStart);
        }
        assert!(started);
    }

    #[test]
    fn wav_round_trip() {
        let s: Vec<i16> = (0..1000).map(|i| (i * 7 % 2000) as i16 - 1000).collect();
        let bytes = wav(&s, SAMPLE_RATE);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(bytes.len(), 44 + 2000);
        assert_eq!(read_wav(&bytes), Some((SAMPLE_RATE, s)));
        assert_eq!(read_wav(b"nope"), None);
    }

    #[test]
    fn ring_keeps_the_tail() {
        let mut r = Ring::new(4);
        r.push(&[1, 2, 3]);
        r.push(&[4, 5, 6]);
        assert_eq!(r.take(), vec![3, 4, 5, 6]);
        assert!(r.take().is_empty());
    }
}
