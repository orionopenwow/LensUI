//! Immersive mode: the Now Playing window full screen on one monitor (big artwork, an ambient field
//! in its colours, big synced lyrics). The window is the existing `nowplaying` one; this module
//! decides whether it may open and where.
//!
//! Never over a fullscreen game or film: when the window in front is fullscreen and isn't Lens,
//! Immersive refuses with a plain message instead of covering it. It opens on the monitor under
//! the pointer (where the person clicked the Dock card or Now Playing), and Esc or × leaves it.

pub const LABEL: &str = "nowplaying";
pub const EVENT: &str = "lens://music/immersive";

/// The refusal shown when a fullscreen app is in front.
pub const BLOCKED: &str = "A full-screen app or game is in front, so Immersive stays closed. Leave full screen and try again.";

/// Whether Immersive may open now.
pub fn may_open(front_fullscreen: bool, front_is_lens: bool) -> Result<(), &'static str> {
    if front_fullscreen && !front_is_lens {
        Err(BLOCKED)
    } else {
        Ok(())
    }
}

/// The monitor rect to fill, from the one under the pointer, else the primary one.
pub fn pick_monitor<T>(under_pointer: Option<T>, primary: Option<T>) -> Option<T> {
    under_pointer.or(primary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn never_over_a_fullscreen_app_that_isnt_lens() {
        assert!(may_open(false, false).is_ok());
        assert_eq!(may_open(true, false), Err(BLOCKED));
        // Lens itself full screen in front (Immersive already, or Now Playing full screen): fine.
        assert!(may_open(true, true).is_ok());
    }

    #[test]
    fn opens_on_the_monitor_under_the_pointer() {
        assert_eq!(pick_monitor(Some(2), Some(1)), Some(2));
        assert_eq!(pick_monitor(None, Some(1)), Some(1));
        assert_eq!(pick_monitor::<u8>(None, None), None);
    }
}
