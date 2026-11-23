//! Microphone capture: WASAPI shared mode, converted by Windows to 16 kHz mono 16-bit, handed
//! out in 20 ms frames. Runs on its own thread until `stop` is set; nothing is stored here.

use super::audio::FRAME;
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
unsafe fn capture_loop(mic_id: &str, stop: &AtomicBool, on_frame: &mut dyn FnMut(&[i16])) -> Result<(), String> {
    use std::time::Duration;
    use windows::core::HSTRING;
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
        WAVEFORMATEX,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    const AUTOCONVERT_PCM: u32 = 0x8000_0000;
    const SRC_DEFAULT_QUALITY: u32 = 0x0800_0000;
    const BUFFER_SILENT: u32 = 0x2;

    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
    let device = if mic_id.is_empty() {
        enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)
    } else {
        enumerator.GetDevice(&HSTRING::from(mic_id))
    }
    .map_err(|_| "No microphone found. Check Windows sound settings.".to_string())?;
    let client: IAudioClient = device.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string())?;
    let format = WAVEFORMATEX {
        wFormatTag: 1, // PCM
        nChannels: 1,
        nSamplesPerSec: 16_000,
        nAvgBytesPerSec: 32_000,
        nBlockAlign: 2,
        wBitsPerSample: 16,
        cbSize: 0,
    };
    client
        .Initialize(AUDCLNT_SHAREMODE_SHARED, AUTOCONVERT_PCM | SRC_DEFAULT_QUALITY, 2_000_000, 0, &format, None)
        .map_err(|e| format!("The microphone couldn't start ({}). Is another app using it exclusively?", e))?;
    let capture: IAudioCaptureClient = client.GetService().map_err(|e| e.to_string())?;
    client.Start().map_err(|e| e.to_string())?;

    let mut pending: Vec<i16> = Vec::with_capacity(FRAME * 8);
    let mut result = Ok(());
    'outer: while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(10));
        loop {
            let packet = match capture.GetNextPacketSize() {
                Ok(n) => n,
                Err(_) => {
                    result = Err("The microphone was disconnected.".to_string());
                    break 'outer;
                }
            };
            if packet == 0 {
                break;
            }
            let mut data: *mut u8 = std::ptr::null_mut();
            let mut frames: u32 = 0;
            let mut flags: u32 = 0;
            if capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None).is_err() {
                result = Err("The microphone was disconnected.".to_string());
                break 'outer;
            }
            if flags & BUFFER_SILENT != 0 || data.is_null() {
                pending.extend(std::iter::repeat(0i16).take(frames as usize));
            } else {
                pending.extend_from_slice(std::slice::from_raw_parts(data as *const i16, frames as usize));
            }
            let _ = capture.ReleaseBuffer(frames);
            while pending.len() >= FRAME {
                let frame: Vec<i16> = pending.drain(..FRAME).collect();
                on_frame(&frame);
            }
        }
    }
    let _ = client.Stop();
    result
}

/// Captures until `stop` is set. Blocks; call on a dedicated thread.
#[cfg(windows)]
pub fn run(mic_id: &str, stop: &AtomicBool, on_frame: &mut dyn FnMut(&[i16])) -> Result<(), String> {
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    unsafe {
        let init = CoInitializeEx(None, COINIT_MULTITHREADED);
        let r = capture_loop(mic_id, stop, on_frame);
        if init.is_ok() {
            CoUninitialize();
        }
        r
    }
}

#[cfg(not(windows))]
pub fn run(_mic_id: &str, stop: &AtomicBool, _on_frame: &mut dyn FnMut(&[i16])) -> Result<(), String> {
    let _ = stop.load(Ordering::Relaxed);
    let _ = FRAME;
    Err("Voice capture needs Windows.".into())
}
