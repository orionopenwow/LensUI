//! The Windows share sheet for a snip, opened over a Lens window.
//!
//! Desktop apps reach the share UI through `IDataTransferManagerInterop` on their own window: we
//! fill the `DataRequested` package with the PNG (as a bitmap, plus title) and Windows shows its
//! picker — Nearby Share, Phone Link, Mail, or any installed share target. The user chooses and
//! sends; Lens never sends anything itself.

#[cfg(windows)]
pub fn show(hwnd: i64, png_path: &std::path::Path, title: &str) -> Result<(), String> {
    use std::sync::Mutex;
    use windows::core::HSTRING;
    use windows::ApplicationModel::DataTransfer::{DataRequestedEventArgs, DataTransferManager};
    use windows::Foundation::{EventRegistrationToken, TypedEventHandler};
    use windows::Storage::Streams::RandomAccessStreamReference;
    use windows::Storage::StorageFile;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::IDataTransferManagerInterop;

    // The handler registered by the previous share on this window (only one at a time).
    static PREV: Mutex<Option<(i64, EventRegistrationToken)>> = Mutex::new(None);

    let err = |e: windows::core::Error| e.message().to_string();
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
    let path = HSTRING::from(png_path.as_os_str());
    let file = StorageFile::GetFileFromPathAsync(&path).map_err(err)?.get().map_err(err)?;
    let image = RandomAccessStreamReference::CreateFromFile(&file).map_err(err)?;
    let interop = windows::core::factory::<DataTransferManager, IDataTransferManagerInterop>().map_err(err)?;
    let manager: DataTransferManager = unsafe { interop.GetForWindow(super::win::hwnd_from(hwnd)) }.map_err(err)?;

    let mut prev = PREV.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((h, token)) = prev.take() {
        if h == hwnd {
            let _ = manager.RemoveDataRequested(token);
        }
    }
    let title = HSTRING::from(title);
    let token = manager
        .DataRequested(&TypedEventHandler::<DataTransferManager, DataRequestedEventArgs>::new(move |_, args| {
            let Some(args) = args.as_ref() else { return Ok(()) };
            let data = args.Request()?.Data()?;
            data.Properties()?.SetTitle(&title)?;
            data.Properties()?.SetDescription(&HSTRING::from("From Lens Snip"))?;
            data.SetBitmap(&image)?;
            Ok(())
        }))
        .map_err(err)?;
    *prev = Some((hwnd, token));
    drop(prev);
    unsafe { interop.ShowShareUIForWindow(super::win::hwnd_from(hwnd)) }.map_err(err)
}

#[cfg(not(windows))]
pub fn show(_hwnd: i64, _png_path: &std::path::Path, _title: &str) -> Result<(), String> {
    Err("The share sheet is only available on Windows.".into())
}
