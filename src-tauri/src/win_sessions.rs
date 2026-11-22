#[cfg(windows)]
fn send_win_ctrl_combo(vk: u16) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
        VK_LCONTROL, VK_LWIN,
    };

    let key = |code: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };

    let target = VIRTUAL_KEY(vk);
    let inputs = [
        key(VK_LWIN, false),
        key(VK_LCONTROL, false),
        key(target, false),
        key(target, true),
        key(VK_LCONTROL, true),
        key(VK_LWIN, true),
    ];

    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

pub fn switch_virtual_desktop(direction: &str) {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            VK_D, VK_F4, VK_LEFT, VK_RIGHT, VK_TAB,
        };
        match direction {
            "left" | "prev" => send_win_ctrl_combo(VK_LEFT.0),
            "right" | "next" => send_win_ctrl_combo(VK_RIGHT.0),
            "new" => send_win_ctrl_combo(VK_D.0),
            "close" => send_win_ctrl_combo(VK_F4.0),
            "overview" => {
                // Win + Tab
                use windows::Win32::UI::Input::KeyboardAndMouse::{
                    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
                    VIRTUAL_KEY, VK_LWIN,
                };
                let key = |code: VIRTUAL_KEY, up: bool| INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: code,
                            wScan: 0,
                            dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                };
                let inputs = [
                    key(VK_LWIN, false),
                    key(VK_TAB, false),
                    key(VK_TAB, true),
                    key(VK_LWIN, true),
                ];
                unsafe {
                    SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
                }
            }
            _ => {}
        }
    }
    #[cfg(not(windows))]
    {
        let _ = direction;
    }
}
