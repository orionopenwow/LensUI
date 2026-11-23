//! The one elevated helper. Lens Cleaner never runs as admin; for the two ADMIN categories it
//! starts `lens-ui.exe --cleaner-elevated <task>` through a UAC prompt, after you approved it in
//! Lens. The helper accepts exactly one of two task names and runs a fixed command for it:
//! nothing from the UI, the scan or any file reaches the command line.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Task {
    /// DISM /Online /Cleanup-Image /StartComponentCleanup (never /ResetBase).
    ComponentCleanup,
    /// Delete-DeliveryOptimizationCache -Force.
    DeliveryOptimization,
}

pub const FLAG: &str = "--cleaner-elevated";

impl Task {
    pub fn id(self) -> &'static str {
        match self {
            Task::ComponentCleanup => "component-cleanup",
            Task::DeliveryOptimization => "delivery-optimization",
        }
    }

    pub fn from_id(id: &str) -> Option<Task> {
        match id {
            "component-cleanup" => Some(Task::ComponentCleanup),
            "delivery-optimization" => Some(Task::DeliveryOptimization),
            _ => None,
        }
    }

    /// The fixed program and arguments (relative to %SystemRoot%\System32).
    pub fn argv(self) -> (&'static str, &'static [&'static str]) {
        match self {
            Task::ComponentCleanup => ("dism.exe", &["/Online", "/Cleanup-Image", "/StartComponentCleanup", "/Quiet", "/NoRestart"]),
            Task::DeliveryOptimization => ("WindowsPowerShell\\v1.0\\powershell.exe", &["-NoProfile", "-NonInteractive", "-Command", "Delete-DeliveryOptimizationCache -Force"]),
        }
    }
}

/// Validates the helper's command line: exactly `<exe> --cleaner-elevated <task>`, nothing else.
/// Returns None when this isn't a helper invocation, Some(Err) when it's a malformed one.
pub fn parse(args: &[String]) -> Option<Result<Task, String>> {
    let i = args.iter().position(|a| a == FLAG)?;
    if i != 1 || args.len() != 3 {
        return Some(Err("The cleaner helper takes exactly one task.".into()));
    }
    Some(Task::from_id(&args[2]).ok_or_else(|| "Unknown cleaner task.".to_string()))
}

/// Runs inside the elevated helper process. Exit code 0 = done.
pub fn run(task: Task) -> i32 {
    let (exe, args) = task.argv();
    let root = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap_or_else(|| "C:\\Windows".into());
    let mut cmd = std::process::Command::new(root.join("System32").join(exe));
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    match cmd.status() {
        Ok(s) => s.code().unwrap_or(1),
        Err(_) => 1,
    }
}

/// Checked first thing at startup (lib.rs): if this process is the helper, run it and exit.
pub fn early_exit_code() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    match parse(&args)? {
        Ok(task) => Some(run(task)),
        Err(e) => {
            eprintln!("Lens: {}", e);
            Some(2)
        }
    }
}

/// From the app: asks Windows for permission (UAC) and runs the helper, waiting for it.
pub fn launch(task: Task) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let code = super::win::run_elevated_and_wait(&exe.to_string_lossy(), &format!("{} {}", FLAG, task.id()))?;
    if code == 0 {
        Ok(())
    } else {
        Err(format!("Windows' cleanup tool stopped with code {}. Nothing else was changed.", code))
    }
}
