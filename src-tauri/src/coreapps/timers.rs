//! Lens Timer: countdown timers, pomodoro and alarms that keep running when the window is
//! hidden. Voice / Command "start a 10 minute timer" lands here too, so every timer shows in one
//! place. The stopwatch lives in the window (it needs no background work).
//!
//! `TimerStore` is pure (time is passed in); `commands/coreapps.rs` owns the background thread
//! that calls `tick`, sends notifications and updates the Dock badge.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TimerKind {
    Timer,
    Pomodoro,
    Alarm,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PomodoroPhase {
    Focus,
    Break,
    LongBreak,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroConfig {
    pub focus_min: u32,
    pub break_min: u32,
    pub long_break_min: u32,
    /// Focus rounds before a long break.
    pub rounds: u32,
    /// Turn on Lens Do Not Disturb during focus (and put it back afterwards).
    pub dnd: bool,
}

impl Default for PomodoroConfig {
    fn default() -> Self {
        Self { focus_min: 25, break_min: 5, long_break_min: 15, rounds: 4, dnd: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimerItem {
    pub id: u64,
    pub kind: TimerKind,
    pub label: String,
    /// Full length of the current run (timer / pomodoro phase), ms.
    pub duration_ms: i64,
    /// When it rings, Unix ms; None while paused or (for alarms) disabled.
    pub ends_at_ms: Option<i64>,
    /// Time left while paused, ms.
    pub remaining_ms: i64,
    pub paused: bool,
    /// Rang and waiting to be dismissed or restarted.
    pub done: bool,
    // Alarms
    pub hour: u8,
    pub minute: u8,
    /// Bit 0 = Monday … bit 6 = Sunday; 0 = once.
    pub weekdays: u8,
    /// Minutes east of UTC when the alarm was set (the window's local time).
    pub tz_offset_min: i32,
    // Pomodoro
    pub phase: Option<PomodoroPhase>,
    /// Focus rounds finished.
    pub round: u32,
    pub pomodoro: Option<PomodoroConfig>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fired {
    pub id: u64,
    pub title: String,
    pub body: String,
    /// Some(true/false): turn Lens Do Not Disturb on/off for a pomodoro phase change.
    pub dnd: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimerStore {
    pub items: Vec<TimerItem>,
    pub next_id: u64,
}

pub const MAX_TIMER_SECS: u64 = 24 * 3600;
pub const MAX_ITEMS: usize = 50;

const DAY_MS: i64 = 86_400_000;

/// A ring this long after its time is said to be late (the PC slept, or Lens wasn't running).
pub const LATE_MS: i64 = 90_000;

/// " · rang late: …" for a ring that came well after its time, else nothing.
fn late_note(due: i64, now: i64) -> &'static str {
    if now - due > LATE_MS {
        " · late: the PC was asleep or Lens wasn't running"
    } else {
        ""
    }
}

/// Next time an alarm at `hour:minute` (local, `tz_offset_min` east of UTC) rings after `now_ms`.
/// `weekdays` bit 0 = Monday … bit 6 = Sunday; 0 means "any day" (once).
pub fn next_alarm(now_ms: i64, tz_offset_min: i32, hour: u8, minute: u8, weekdays: u8) -> i64 {
    let off = tz_offset_min as i64 * 60_000;
    let local_now = now_ms + off;
    let day_start = local_now.div_euclid(DAY_MS) * DAY_MS;
    let at = (hour.min(23) as i64 * 60 + minute.min(59) as i64) * 60_000;
    for d in 0..8 {
        let candidate = day_start + d * DAY_MS + at;
        if candidate <= local_now {
            continue;
        }
        // 1970-01-01 was a Thursday (index 3 with Monday = 0).
        let wd = ((candidate.div_euclid(DAY_MS) + 3).rem_euclid(7)) as u8;
        if weekdays & 0x7F == 0 || weekdays & (1 << wd) != 0 {
            return candidate - off;
        }
    }
    day_start + DAY_MS + at - off
}

fn fmt_len(ms: i64) -> String {
    let s = (ms / 1000).max(0);
    let (h, m, sec) = (s / 3600, (s % 3600) / 60, s % 60);
    match (h, m, sec) {
        (0, 0, s) => format!("{s} s"),
        (0, m, 0) => format!("{m} min"),
        (0, m, s) => format!("{m} min {s} s"),
        (h, 0, _) => format!("{h} h"),
        (h, m, _) => format!("{h} h {m} min"),
    }
}

/// "12:04" / "1:02:03": the Dock badge and window countdown.
pub fn clock(ms: i64) -> String {
    let s = (ms + 999).max(0) / 1000;
    let (h, m, sec) = (s / 3600, (s % 3600) / 60, s % 60);
    if h > 0 {
        format!("{h}:{m:02}:{sec:02}")
    } else {
        format!("{m}:{sec:02}")
    }
}

impl TimerStore {
    fn blank(&mut self, kind: TimerKind, label: &str) -> Result<TimerItem, String> {
        if self.items.len() >= MAX_ITEMS {
            return Err("That's a lot of timers. Remove one first.".into());
        }
        self.next_id += 1;
        let label: String = label.trim().chars().take(60).collect();
        Ok(TimerItem {
            id: self.next_id,
            kind,
            label,
            duration_ms: 0,
            ends_at_ms: None,
            remaining_ms: 0,
            paused: false,
            done: false,
            hour: 0,
            minute: 0,
            weekdays: 0,
            tz_offset_min: 0,
            phase: None,
            round: 0,
            pomodoro: None,
        })
    }

    pub fn add_timer(&mut self, label: &str, secs: u64, now: i64) -> Result<u64, String> {
        if secs == 0 || secs > MAX_TIMER_SECS {
            return Err("Timers run from 1 second to 24 hours.".into());
        }
        let mut t = self.blank(TimerKind::Timer, if label.trim().is_empty() { "Timer" } else { label })?;
        t.duration_ms = secs as i64 * 1000;
        t.remaining_ms = t.duration_ms;
        t.ends_at_ms = Some(now + t.duration_ms);
        let id = t.id;
        self.items.push(t);
        Ok(id)
    }

    pub fn add_alarm(&mut self, label: &str, hour: u8, minute: u8, weekdays: u8, tz_offset_min: i32, now: i64) -> Result<u64, String> {
        if hour > 23 || minute > 59 {
            return Err("That isn't a time of day.".into());
        }
        let mut t = self.blank(TimerKind::Alarm, if label.trim().is_empty() { "Alarm" } else { label })?;
        t.hour = hour;
        t.minute = minute;
        t.weekdays = weekdays & 0x7F;
        t.tz_offset_min = tz_offset_min.clamp(-14 * 60, 14 * 60);
        t.ends_at_ms = Some(next_alarm(now, t.tz_offset_min, hour, minute, t.weekdays));
        let id = t.id;
        self.items.push(t);
        Ok(id)
    }

    /// Starts a pomodoro (only one at a time: a new one replaces the old).
    /// Returns the id and whether DND should be turned on.
    pub fn start_pomodoro(&mut self, cfg: PomodoroConfig, now: i64) -> Result<(u64, bool), String> {
        let cfg = PomodoroConfig {
            focus_min: cfg.focus_min.clamp(1, 180),
            break_min: cfg.break_min.clamp(1, 60),
            long_break_min: cfg.long_break_min.clamp(1, 120),
            rounds: cfg.rounds.clamp(1, 12),
            dnd: cfg.dnd,
        };
        self.items.retain(|t| t.kind != TimerKind::Pomodoro);
        let mut t = self.blank(TimerKind::Pomodoro, "Focus")?;
        t.duration_ms = cfg.focus_min as i64 * 60_000;
        t.remaining_ms = t.duration_ms;
        t.ends_at_ms = Some(now + t.duration_ms);
        t.phase = Some(PomodoroPhase::Focus);
        let dnd = cfg.dnd;
        t.pomodoro = Some(cfg);
        let id = t.id;
        self.items.push(t);
        Ok((id, dnd))
    }

    fn get(&mut self, id: u64) -> Result<&mut TimerItem, String> {
        self.items.iter_mut().find(|t| t.id == id).ok_or_else(|| "That timer is gone.".to_string())
    }

    pub fn pause(&mut self, id: u64, now: i64) -> Result<(), String> {
        let t = self.get(id)?;
        if t.kind == TimerKind::Alarm {
            t.ends_at_ms = None;
            t.paused = true;
            return Ok(());
        }
        if let Some(end) = t.ends_at_ms.take() {
            t.remaining_ms = (end - now).max(0);
            t.paused = true;
        }
        Ok(())
    }

    pub fn resume(&mut self, id: u64, now: i64) -> Result<(), String> {
        let t = self.get(id)?;
        if !t.paused {
            return Ok(());
        }
        t.paused = false;
        t.done = false;
        t.ends_at_ms = Some(if t.kind == TimerKind::Alarm { next_alarm(now, t.tz_offset_min, t.hour, t.minute, t.weekdays) } else { now + t.remaining_ms });
        Ok(())
    }

    /// Back to full length and running (timers), or the start of the focus phase (pomodoro).
    pub fn restart(&mut self, id: u64, now: i64) -> Result<(), String> {
        let t = self.get(id)?;
        if t.kind == TimerKind::Pomodoro {
            if let Some(cfg) = &t.pomodoro {
                t.duration_ms = cfg.focus_min as i64 * 60_000;
            }
            t.phase = Some(PomodoroPhase::Focus);
            t.round = 0;
            t.label = "Focus".into();
        }
        if t.kind == TimerKind::Alarm {
            t.ends_at_ms = Some(next_alarm(now, t.tz_offset_min, t.hour, t.minute, t.weekdays));
        } else {
            t.remaining_ms = t.duration_ms;
            t.ends_at_ms = Some(now + t.duration_ms);
        }
        t.paused = false;
        t.done = false;
        Ok(())
    }

    /// Removes an item. Returns true when it was a running focus phase with DND (so the caller
    /// can put Do Not Disturb back).
    pub fn remove(&mut self, id: u64) -> bool {
        let was_focus = self.items.iter().any(|t| t.id == id && t.phase == Some(PomodoroPhase::Focus) && t.pomodoro.as_ref().is_some_and(|c| c.dnd) && !t.done);
        self.items.retain(|t| t.id != id);
        was_focus
    }

    /// Rings everything due at `now` and moves pomodoros to their next phase.
    pub fn tick(&mut self, now: i64) -> Vec<Fired> {
        let mut out = Vec::new();
        for t in &mut self.items {
            let Some(end) = t.ends_at_ms else { continue };
            if end > now {
                continue;
            }
            match t.kind {
                TimerKind::Timer => {
                    t.ends_at_ms = None;
                    t.remaining_ms = 0;
                    t.done = true;
                    out.push(Fired { id: t.id, title: t.label.clone(), body: format!("Time's up · {}{}", fmt_len(t.duration_ms), late_note(end, now)), dnd: None });
                }
                TimerKind::Alarm => {
                    out.push(Fired { id: t.id, title: t.label.clone(), body: format!("Alarm · {:02}:{:02}{}", t.hour, t.minute, late_note(end, now)), dnd: None });
                    if t.weekdays == 0 {
                        t.ends_at_ms = None;
                        t.paused = true;
                        t.done = true;
                    } else {
                        t.ends_at_ms = Some(next_alarm(now.max(end) + 1000, t.tz_offset_min, t.hour, t.minute, t.weekdays));
                    }
                }
                TimerKind::Pomodoro => {
                    let cfg = t.pomodoro.clone().unwrap_or_default();
                    let (next, title, body, dnd) = match t.phase.unwrap_or(PomodoroPhase::Focus) {
                        PomodoroPhase::Focus => {
                            t.round += 1;
                            let long = t.round % cfg.rounds == 0;
                            let p = if long { PomodoroPhase::LongBreak } else { PomodoroPhase::Break };
                            let mins = if long { cfg.long_break_min } else { cfg.break_min };
                            (p, "Focus done".to_string(), format!("Round {} finished. {} min {}break.", t.round, mins, if long { "long " } else { "" }), cfg.dnd.then_some(false))
                        }
                        PomodoroPhase::Break | PomodoroPhase::LongBreak => {
                            (PomodoroPhase::Focus, "Break over".to_string(), format!("Back to focus · {} min", cfg.focus_min), cfg.dnd.then_some(true))
                        }
                    };
                    let mins = match next {
                        PomodoroPhase::Focus => cfg.focus_min,
                        PomodoroPhase::Break => cfg.break_min,
                        PomodoroPhase::LongBreak => cfg.long_break_min,
                    };
                    t.phase = Some(next);
                    t.label = match next {
                        PomodoroPhase::Focus => "Focus",
                        PomodoroPhase::Break => "Break",
                        PomodoroPhase::LongBreak => "Long break",
                    }
                    .into();
                    t.duration_ms = mins as i64 * 60_000;
                    t.remaining_ms = t.duration_ms;
                    t.ends_at_ms = Some(now + t.duration_ms);
                    out.push(Fired { id: t.id, title, body, dnd });
                }
            }
        }
        out
    }

    /// The soonest running countdown (timer or pomodoro): what the Dock badge shows.
    pub fn badge(&self, now: i64) -> Option<String> {
        self.items
            .iter()
            .filter(|t| t.kind != TimerKind::Alarm)
            .filter_map(|t| t.ends_at_ms)
            .min()
            .map(|end| clock(end - now))
    }

    /// A timer or pomodoro is counting down, so the Dock badge and the window change every
    /// second. An alarm alone is not: nothing on screen moves until it rings (B-125).
    pub fn counting(&self) -> bool {
        self.items.iter().any(|t| t.kind != TimerKind::Alarm && t.ends_at_ms.is_some())
    }

    /// How long the background thread may sleep: one second while something counts down,
    /// otherwise until the next alarm is due, and never more than `idle_ms` (so a changed clock or
    /// time zone is noticed).
    pub fn sleep_ms(&self, now: i64, idle_ms: i64) -> i64 {
        if self.counting() {
            return 1000;
        }
        let next = self.items.iter().filter_map(|t| t.ends_at_ms).min();
        match next {
            Some(end) => (end - now).clamp(50, idle_ms),
            None => idle_ms,
        }
    }

    /// Keeps alarms on local time when the PC's offset from UTC changes: daylight saving starting
    /// or ending, or a move to another time zone (B-124). An alarm stores the offset it was set
    /// with, so without this a 07:00 alarm rang at 06:00 or 08:00 after the clocks changed.
    /// Alarms that are already due are left for `tick` to ring first. Returns true when anything
    /// changed.
    pub fn retime_alarms(&mut self, tz_offset_min: i32, now: i64) -> bool {
        let tz = tz_offset_min.clamp(-14 * 60, 14 * 60);
        let mut changed = false;
        for t in &mut self.items {
            if t.kind != TimerKind::Alarm || t.tz_offset_min == tz {
                continue;
            }
            match t.ends_at_ms {
                Some(end) if end <= now => continue,
                Some(_) => t.ends_at_ms = Some(next_alarm(now, tz, t.hour, t.minute, t.weekdays)),
                None => {}
            }
            t.tz_offset_min = tz;
            changed = true;
        }
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-23 (a Monday) 09:00:00 UTC.
    const MON_9: i64 = 1_795_424_400_000;

    #[test]
    fn epoch_weekday_anchor() {
        // Sanity: MON_9 really is a Monday 09:00 UTC.
        assert_eq!(MON_9.rem_euclid(DAY_MS), 9 * 3_600_000);
        assert_eq!(((MON_9.div_euclid(DAY_MS) + 3).rem_euclid(7)), 0);
    }

    #[test]
    fn alarms_schedule() {
        // Later today.
        assert_eq!(next_alarm(MON_9, 0, 10, 30, 0), MON_9 + 90 * 60_000);
        // Already passed today → tomorrow.
        assert_eq!(next_alarm(MON_9, 0, 8, 0, 0), MON_9 - 3_600_000 + DAY_MS);
        // Exactly now → tomorrow (never rings twice).
        assert_eq!(next_alarm(MON_9, 0, 9, 0, 0), MON_9 + DAY_MS);
        // Weekdays only (Mon–Fri = 0b0011111), asked on Friday after the time → Monday.
        let fri_10 = MON_9 + 4 * DAY_MS + 3_600_000;
        assert_eq!(next_alarm(fri_10, 0, 7, 0, 0b001_1111), MON_9 + 7 * DAY_MS - 2 * 3_600_000);
        // Sunday only (bit 6).
        assert_eq!(next_alarm(MON_9, 0, 9, 0, 1 << 6), MON_9 + 6 * DAY_MS);
        // Time zones: 07:00 local at UTC+2 is 05:00 UTC.
        assert_eq!(next_alarm(MON_9, 120, 7, 0, 0), MON_9 - 4 * 3_600_000 + DAY_MS);
        // UTC-5, local is 04:00 Monday; 06:00 local = 11:00 UTC today.
        assert_eq!(next_alarm(MON_9, -300, 6, 0, 0), MON_9 + 2 * 3_600_000);
    }

    #[test]
    fn timer_lifecycle() {
        let mut s = TimerStore::default();
        let id = s.add_timer("Tea", 180, MON_9).unwrap();
        assert!(s.add_timer("x", 0, MON_9).is_err());
        assert!(s.add_timer("x", MAX_TIMER_SECS + 1, MON_9).is_err());
        assert_eq!(s.badge(MON_9 + 1000), Some("2:59".into()));
        assert!(s.tick(MON_9 + 60_000).is_empty());
        s.pause(id, MON_9 + 60_000).unwrap();
        assert!(!s.counting());
        assert!(s.tick(MON_9 + 10 * 60_000).is_empty(), "paused timers never ring");
        s.resume(id, MON_9 + 10 * 60_000).unwrap();
        assert_eq!(s.items[0].ends_at_ms, Some(MON_9 + 12 * 60_000));
        let f = s.tick(MON_9 + 12 * 60_000);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].title, "Tea");
        assert_eq!(f[0].body, "Time's up · 3 min");
        assert!(s.items[0].done);
        assert!(s.tick(MON_9 + 13 * 60_000).is_empty(), "rings once");
        s.restart(id, MON_9 + 20 * 60_000).unwrap();
        assert_eq!(s.items[0].ends_at_ms, Some(MON_9 + 23 * 60_000));
        assert!(!s.remove(id));
        assert!(s.items.is_empty());
    }

    #[test]
    fn repeating_alarm_reschedules_and_one_off_stops() {
        let mut s = TimerStore::default();
        let daily = s.add_alarm("Stand up", 9, 30, 0x7F, 0, MON_9).unwrap();
        let once = s.add_alarm("", 9, 15, 0, 0, MON_9).unwrap();
        let f = s.tick(MON_9 + 15 * 60_000);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, once);
        assert_eq!(f[0].title, "Alarm");
        let f = s.tick(MON_9 + 30 * 60_000);
        assert_eq!(f[0].id, daily);
        let d = s.items.iter().find(|t| t.id == daily).unwrap();
        assert_eq!(d.ends_at_ms, Some(MON_9 + 30 * 60_000 + DAY_MS));
        let o = s.items.iter().find(|t| t.id == once).unwrap();
        assert!(o.done && o.ends_at_ms.is_none());
        assert!(s.add_alarm("x", 24, 0, 0, 0, MON_9).is_err());
        assert_eq!(s.badge(MON_9), None, "alarms don't take the badge");
    }

    #[test]
    fn pomodoro_cycles_and_dnd() {
        let mut s = TimerStore::default();
        let cfg = PomodoroConfig { focus_min: 25, break_min: 5, long_break_min: 15, rounds: 2, dnd: true };
        let (id, dnd) = s.start_pomodoro(cfg, MON_9).unwrap();
        assert!(dnd);
        let mut now = MON_9;
        // focus → break
        now += 25 * 60_000;
        let f = s.tick(now);
        assert_eq!(f[0].dnd, Some(false));
        assert_eq!(s.items[0].phase, Some(PomodoroPhase::Break));
        assert_eq!(s.items[0].duration_ms, 5 * 60_000);
        // break → focus
        now += 5 * 60_000;
        assert_eq!(s.tick(now)[0].dnd, Some(true));
        // focus (round 2) → long break
        now += 25 * 60_000;
        let f = s.tick(now);
        assert_eq!(s.items[0].phase, Some(PomodoroPhase::LongBreak));
        assert!(f[0].body.contains("long break"), "{}", f[0].body);
        assert_eq!(s.items[0].round, 2);
        // A second pomodoro replaces the first.
        let (id2, _) = s.start_pomodoro(PomodoroConfig::default(), now).unwrap();
        assert_ne!(id, id2);
        assert_eq!(s.items.iter().filter(|t| t.kind == TimerKind::Pomodoro).count(), 1);
        // Removing during focus says "restore DND".
        assert!(s.remove(id2));
    }

    #[test]
    fn alarms_follow_the_clock_change() {
        // 07:00 every day, set in summer at UTC+2 (so 05:00 UTC). MON_9 is 11:00 local.
        let mut s = TimerStore::default();
        let id = s.add_alarm("Up", 7, 0, 0x7F, 120, MON_9).unwrap();
        let summer = MON_9 - 4 * 3_600_000 + DAY_MS;
        assert_eq!(s.items[0].ends_at_ms, Some(summer));
        // Nothing to do while the offset is the same.
        assert!(!s.retime_alarms(120, MON_9));
        // The clocks go back to UTC+1: 07:00 local is now 06:00 UTC, an hour later than stored.
        assert!(s.retime_alarms(60, MON_9 + 60_000));
        assert_eq!(s.items[0].ends_at_ms, Some(summer + 3_600_000));
        assert_eq!(s.items[0].tz_offset_min, 60);
        // It rings at 07:00 on the new clock, not at 06:00.
        assert!(s.tick(summer + 1000).is_empty(), "06:00 local: too early");
        let f = s.tick(summer + 3_600_000);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].body, "Alarm · 07:00");
        // A switched-off alarm keeps its place but learns the new offset for when it is resumed.
        s.pause(id, summer + 3_600_000).unwrap();
        assert!(s.retime_alarms(120, summer + 3_600_000));
        assert_eq!(s.items[0].ends_at_ms, None);
        s.resume(id, summer + 3_600_000 + 1000).unwrap();
        assert_eq!(s.items[0].ends_at_ms, Some(summer + DAY_MS));
        // An alarm that is already due is rung first, never moved past its time.
        let mut d = TimerStore::default();
        d.add_alarm("Due", 9, 30, 0, 0, MON_9).unwrap();
        assert!(!d.retime_alarms(60, MON_9 + 31 * 60_000));
        assert_eq!(d.tick(MON_9 + 31 * 60_000).len(), 1);
        // Timers and pomodoros count real time and never move.
        let mut t = TimerStore::default();
        t.add_timer("Tea", 180, MON_9).unwrap();
        assert!(!t.retime_alarms(60, MON_9));
        assert_eq!(t.items[0].ends_at_ms, Some(MON_9 + 180_000));
    }

    #[test]
    fn a_ring_after_sleep_says_it_is_late_and_rings_once() {
        let mut s = TimerStore::default();
        s.add_timer("Tea", 180, MON_9).unwrap();
        let daily = s.add_alarm("Stand up", 9, 30, 0x7F, 0, MON_9).unwrap();
        // The PC wakes three hours later: both are overdue.
        let woke = MON_9 + 3 * 3_600_000;
        let f = s.tick(woke);
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].body, "Time's up · 3 min · late: the PC was asleep or Lens wasn't running");
        assert_eq!(f[1].body, "Alarm · 09:30 · late: the PC was asleep or Lens wasn't running");
        // The repeating alarm moves to tomorrow (one ring for the missed one, not a burst).
        let d = s.items.iter().find(|t| t.id == daily).unwrap();
        assert_eq!(d.ends_at_ms, Some(MON_9 + 30 * 60_000 + DAY_MS));
        assert!(s.tick(woke + 1000).is_empty());
        // On time (within the tick's own slack) says nothing extra.
        let mut p = TimerStore::default();
        p.add_timer("Tea", 180, MON_9).unwrap();
        assert_eq!(p.tick(MON_9 + 180_000 + LATE_MS)[0].body, "Time's up · 3 min");
    }

    #[test]
    fn an_alarm_alone_does_not_keep_the_thread_awake() {
        let mut s = TimerStore::default();
        assert_eq!(s.sleep_ms(MON_9, 5000), 5000);
        let alarm = s.add_alarm("Later", 10, 0, 0, 0, MON_9).unwrap();
        assert!(!s.counting(), "an alarm changes nothing on screen until it rings");
        assert_eq!(s.sleep_ms(MON_9, 5000), 5000);
        // Close to its time the sleep shortens, so it rings on the minute.
        assert_eq!(s.sleep_ms(MON_9 + 3_600_000 - 1200, 5000), 1200);
        assert_eq!(s.sleep_ms(MON_9 + 3_600_000 + 10, 5000), 50);
        let t = s.add_timer("Tea", 180, MON_9).unwrap();
        assert!(s.counting());
        assert_eq!(s.sleep_ms(MON_9, 5000), 1000);
        s.pause(t, MON_9).unwrap();
        assert!(!s.counting());
        s.remove(alarm);
        assert_eq!(s.sleep_ms(MON_9, 5000), 5000);
    }

    #[test]
    fn clock_format() {
        assert_eq!(clock(0), "0:00");
        assert_eq!(clock(59_001), "1:00");
        assert_eq!(clock(61_000), "1:01");
        assert_eq!(clock(3_723_000), "1:02:03");
        assert_eq!(clock(-5), "0:00");
    }

    #[test]
    fn store_round_trips_as_json() {
        let mut s = TimerStore::default();
        s.add_timer("Pasta", 600, MON_9).unwrap();
        s.start_pomodoro(PomodoroConfig::default(), MON_9).unwrap();
        let j = serde_json::to_string(&s).unwrap();
        let back: TimerStore = serde_json::from_str(&j).unwrap();
        assert_eq!(back, s);
    }
}
