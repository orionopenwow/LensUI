//! Speaker peak level for the audio-reactive Now Playing scene: one number between 0 and 1
//! from Windows' endpoint meter (`IAudioMeterInformation`). No samples are captured,
//! recorded or stored, and it's only read while that scene is visible with the option on.

/// Smooths a raw peak into a calm 0..1 level (fast attack, slow release).
pub fn smooth(previous: f32, raw: f32) -> f32 {
    let raw = if raw.is_finite() { raw.clamp(0.0, 1.0) } else { 0.0 };
    if raw > previous {
        previous + (raw - previous) * 0.6
    } else {
        previous + (raw - previous) * 0.12
    }
}

#[cfg(windows)]
pub fn peak() -> f32 {
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

    thread_local! {
        static METER: std::cell::RefCell<Option<IAudioMeterInformation>> = const { std::cell::RefCell::new(None) };
    }
    METER.with(|cell| {
        let mut slot = cell.borrow_mut();
        if slot.is_none() {
            *slot = unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .and_then(|e| e.GetDefaultAudioEndpoint(eRender, eMultimedia))
                    .and_then(|d| d.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None))
                    .ok()
            };
        }
        match slot.as_ref().map(|m| unsafe { m.GetPeakValue() }) {
            Some(Ok(v)) => v,
            Some(Err(_)) => {
                // Default device changed or went away: rebuild on the next call.
                *slot = None;
                0.0
            }
            None => 0.0,
        }
    })
}

#[cfg(not(windows))]
pub fn peak() -> f32 {
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoothing_attacks_fast_and_releases_slow() {
        let up = smooth(0.0, 1.0);
        assert!(up > 0.5);
        let down = smooth(1.0, 0.0);
        assert!(down > 0.8);
        assert_eq!(smooth(0.3, f32::NAN), 0.3 - 0.3 * 0.12);
        assert!(smooth(0.0, 5.0) <= 1.0);
    }
}
