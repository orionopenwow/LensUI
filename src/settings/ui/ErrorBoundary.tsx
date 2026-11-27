import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/** Keeps one broken page from blanking the whole Settings window. */
export class PageErrorBoundary extends React.Component<
  { pageLabel: string; resetKey?: string; children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    console.warn(`[settings] ${this.props.pageLabel} failed to render:`, error.message);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="cc-card sh-crash" role="alert">
        <div className="sh-crash-title">
          <AlertTriangle size={15} aria-hidden /> {this.props.pageLabel} couldn't load
        </div>
        <div className="sh-row-desc">{this.state.error.message || "Something went wrong on this page."} The rest of Settings still works.</div>
        <div>
          <button data-weight="medium" type="button" className="cc-btn" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={13} aria-hidden /> Retry
          </button>
        </div>
      </div>
    );
  }
}
