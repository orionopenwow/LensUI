// The "feel" scene (DESIGN.md §5.5): every press weight at rest, hover, pressed, pending and
// disabled, toggles mid-press, and the segmented indicator, in the current theme pack.
//   feel/index.html?preset=<pack>            the matrix (visual goldens, tools/visual/run.mjs)
//   feel/index.html?preset=<pack>&mode=demo  three big controls for frame strips and perf
// Pressed and pending are forced through their attributes (data-press="in", data-pending), hover
// through DevTools' forced pseudo-state (the shooter does that), so the frames are deterministic.
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { Search, Download, Trash2 } from "lucide-react";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { Button, IconButton, Toggle, Segmented, Chip } from "../../../src/ui";
import { installPress } from "../../../src/ui/press";
import { growFrom, returnTo } from "../../../src/ui/motion/flow";
import "./feel.css";

installPress();
const p = new URLSearchParams(location.search);
const mode = p.get("mode") || "matrix";

type State = "rest" | "hover" | "pressed" | "pending" | "disabled";
const STATES: State[] = ["rest", "hover", "pressed", "pending", "disabled"];

/** Attributes that put a control in a state without touching it. */
const forced = (s: State) =>
  s === "pressed" ? { "data-press": "in" } : s === "hover" ? { "data-force-hover": "" } : {};

const Row: React.FC<{ title: string; children: (s: State) => React.ReactNode }> = ({ title, children }) => (
  <div className="feel-row">
    <div className="feel-row-title">{title}</div>
    {STATES.map((s) => (
      <div key={s} className="feel-cell">
        {children(s)}
      </div>
    ))}
  </div>
);

const Matrix = () => {
  const [seg, setSeg] = useState<"day" | "week" | "month">("week");
  return (
    <div className="feel">
      <div className="feel-row feel-head">
        <div className="feel-row-title" />
        {STATES.map((s) => (
          <div key={s} className="feel-cell feel-state">
            {s}
          </div>
        ))}
      </div>
      <Row title="light">
        {(s) => (
          <button type="button" className="cc-nav-btn feel-light" data-weight="light" disabled={s === "disabled"} data-pending={s === "pending" ? "true" : undefined} {...forced(s)}>
            Display
          </button>
        )}
      </Row>
      <Row title="light chip">
        {(s) => (
          <span className="feel-chipwrap" {...(s === "pressed" ? { "data-chip-pressed": "" } : {})}>
            <Chip onClick={() => {}} selected={false}>
              Wi-Fi
            </Chip>
          </span>
        )}
      </Row>
      <Row title="medium">
        {(s) => (
          <Button icon={<Search size={14} />} disabled={s === "disabled"} pending={s === "pending"} {...forced(s)}>
            Search
          </Button>
        )}
      </Row>
      <Row title="medium icon">
        {(s) => <IconButton label="Search" variant="default" icon={<Search size={15} />} disabled={s === "disabled"} pending={s === "pending"} {...forced(s)} />}
      </Row>
      <Row title="heavy">
        {(s) => (
          <Button variant="primary" icon={<Download size={14} />} disabled={s === "disabled"} pending={s === "pending"} {...forced(s)}>
            Install
          </Button>
        )}
      </Row>
      <Row title="heavy danger">
        {(s) => (
          <Button variant="danger" icon={<Trash2 size={14} />} disabled={s === "disabled"} pending={s === "pending"} {...forced(s)}>
            Remove
          </Button>
        )}
      </Row>
      <div className="feel-row">
        <div className="feel-row-title">toggles</div>
        <div className="feel-cell">
          <Toggle label="Off" checked={false} onChange={() => {}} />
        </div>
        <div className="feel-cell" data-toggle-press="">
          <Toggle label="Off, pressed" checked={false} onChange={() => {}} />
        </div>
        <div className="feel-cell">
          <Toggle label="On" checked onChange={() => {}} />
        </div>
        <div className="feel-cell" data-toggle-press="">
          <Toggle label="On, pressed" checked onChange={() => {}} />
        </div>
        <div className="feel-cell">
          <Toggle label="Disabled" checked disabled onChange={() => {}} />
        </div>
      </div>
      <div className="feel-row feel-wide">
        <div className="feel-row-title">segmented</div>
        <div className="feel-cell feel-span">
          <Segmented
            label="Range"
            value={seg}
            onChange={setSeg}
            options={[
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
              { id: "month", label: "Month" },
            ]}
          />
        </div>
        <div className="feel-cell feel-span">
          <Segmented label="Range (disabled)" value="day" disabled onChange={() => {}} options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }]} />
        </div>
      </div>
    </div>
  );
};

/** Three big controls for recording a press frame by frame, and a card that grows from its trigger. */
const Demo = () => {
  const pop = React.useRef<HTMLDivElement>(null);
  const open = React.useRef(false);
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const box = { left: r.left, top: r.top, width: r.width, height: r.height };
    open.current = !open.current;
    pop.current?.classList.add("is-open");
    if (open.current) growFrom(pop.current, box);
    else returnTo(pop.current, box);
  };
  return (
  <div className="feel-demo">
    <Button size="lg" icon={<Search size={16} />} data-demo="medium">
      Search
    </Button>
    <Button size="lg" variant="primary" icon={<Download size={16} />} data-demo="heavy">
      Install
    </Button>
    <Toggle label="Night light" checked={false} onChange={() => {}} />
    <div ref={pop} className="feel-pop" data-demo="pop" aria-hidden>
      <div className="feel-pop-title">Quick settings</div>
      <div className="feel-pop-grid">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
    <button type="button" className="cc-btn feel-trigger" data-weight="medium" data-demo="trigger" onClick={toggle}>
      Open
    </button>
  </div>
  );
};

const App = () => {
  useLensState();
  React.useLayoutEffect(() => {
    // Toggles "mid-press": force the attribute on the switch inside each marked cell.
    for (const el of document.querySelectorAll("[data-toggle-press] [role=switch], [data-chip-pressed] .lens-chip")) el.setAttribute("data-press", "in");
    document.documentElement.dataset.feelReady = "1";
  });
  return mode === "demo" ? <Demo /> : <Matrix />;
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
