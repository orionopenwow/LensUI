// The one error boundary every surface runs inside (docs/FAILSAFE.md §1). A surface that throws
// while rendering no longer leaves a blank or half-drawn window: it reports, reloads itself once,
// and gives up politely after three failures in a row.
import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { HEALTHY_AFTER_MS, isDisabled, isOverlay, nextRecord, problemText, stepFor, type Step } from "./policy";
import { noteNoticeShown, readRecord, reportCrash, writeRecord } from "./report";
import "./failsafe.css";

interface Props {
  surface: string;
  children: React.ReactNode;
}

interface State {
  failed: boolean;
  step: Step | null;
}

export class SurfaceBoundary extends React.Component<Props, State> {
  private reloadTimer: number | undefined;
  private healthyTimer: number | undefined;

  constructor(props: Props) {
    super(props);
    // A surface that already gave up in this session stays off across its own reloads.
    const gaveUp = isDisabled(readRecord(props.surface));
    this.state = { failed: gaveUp, step: gaveUp ? { kind: "disabled" } : null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidMount(): void {
    if (this.state.failed) {
      this.hideIfOverlay();
      this.showCard();
      return;
    }
    this.healthyTimer = window.setTimeout(() => {
      if (!this.state.failed) writeRecord(this.props.surface, null);
    }, HEALTHY_AFTER_MS);
  }

  componentWillUnmount(): void {
    window.clearTimeout(this.reloadTimer);
    window.clearTimeout(this.healthyTimer);
  }

  componentDidCatch(error: unknown): void {
    const { surface } = this.props;
    window.clearTimeout(this.healthyTimer);
    const record = nextRecord(readRecord(surface), Date.now());
    writeRecord(surface, record);
    const step = stepFor(record.count, isOverlay(surface));
    reportCrash(surface, error, step.kind === "disabled");
    this.hideIfOverlay();
    // The reload is timed from the moment the notice is on screen, not from the catch, so a busy
    // page cannot reload before the person (or the test) could read it.
    this.setState({ step }, () => {
      if (!isOverlay(surface)) noteNoticeShown(surface, problemText(step));
      if (step.kind !== "reload") this.showCard();
      if (step.kind === "reload") {
        window.clearTimeout(this.reloadTimer);
        this.reloadTimer = window.setTimeout(() => window.location.reload(), step.afterMs);
      }
    });
  }

  /** A crashed overlay must not stay on screen as an invisible sheet over the desktop. */
  private hideIfOverlay(): void {
    if (isOverlay(this.props.surface)) invoke("hide_surface", { label: this.props.surface }).catch(() => {});
  }

  /** The Dock, Top Bar and desktop tab stay hidden until their page reports ready. A page that
   *  crashed before it got that far reports ready here, so its card can be seen and clicked. */
  private showCard(): void {
    if (!isOverlay(this.props.surface)) invoke("surface_ready_cmd", { label: this.props.surface }).catch(() => {});
  }

  private reload = (): void => {
    // "Try again" after giving up is the person's decision: start counting from zero.
    if (this.state.step?.kind === "disabled") writeRecord(this.props.surface, null);
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    const { step } = this.state;
    if (!step || isOverlay(this.props.surface)) return null;
    return (
      <div className="fs-problem" role="alert">
        <div className="fs-problem-card">
          <span className="fs-problem-text">{problemText(step)}</span>
          {step.kind !== "reload" ? (
            <button type="button" className="fs-problem-btn" onClick={this.reload}>
              {step.kind === "disabled" ? "Try again" : "Reload"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}

/** For helpers mounted beside a surface (coach marks, the presence twin): if one of them throws,
 *  it disappears and is reported; the surface carries on. */
export class QuietBoundary extends React.Component<{ name: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    reportCrash(this.props.name, error, false);
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Event the chaos tests dispatch on `window` to make the surface throw on its next render. */
export const TEST_CRASH_EVENT = "lens:test-crash";

/**
 * Fault injection for the chaos tests (tools/soak, tests/e2e/failsafe.mjs): rendered inside the
 * surface's boundary, it throws on the render after `lens:test-crash` is dispatched on `window`.
 * Only a script already running in the page can do that, and all it achieves is what the page
 * could do to itself anyway: show the boundary.
 */
export function CrashProbe(): null {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    const arm = () => setArmed(true);
    window.addEventListener(TEST_CRASH_EVENT, arm);
    return () => window.removeEventListener(TEST_CRASH_EVENT, arm);
  }, []);
  if (armed) throw new Error("test crash (lens:test-crash)");
  return null;
}
