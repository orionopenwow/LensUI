// Pure logic for the in-page selection button and the per-site settings.
// Loaded three ways, so it has no imports/exports and attaches to globalThis.LensSel:
//   • as a classic content script (registered dynamically, opt-in),
//   • as a side-effect module import from background.js / options.js,
//   • from bun tests.
(function (root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    /** "off" | "sites" | "all" */
    selectionButton: "off",
    /** Hosts where the button is on when selectionButton === "sites". */
    sites: [],
    /** Hosts where Lens never shows the button. */
    never: [],
    /** Tile pre-selected in the in-page panel (Enter runs it). */
    defaultAction: "summarize",
  });

  const TILE_ACTIONS = ["summarize", "explain", "translate", "rewrite", "ask", "shelf_add"];

  /** Banking, payments, identity and password-manager sites: never show the button. */
  const BUILTIN_DENY = [
    "paypal.com", "venmo.com", "stripe.com", "chase.com", "wellsfargo.com", "bankofamerica.com", "citi.com",
    "capitalone.com", "americanexpress.com", "usbank.com", "pnc.com", "schwab.com", "fidelity.com",
    "vanguard.com", "robinhood.com", "coinbase.com", "kraken.com", "binance.com", "revolut.com", "wise.com",
    "monzo.com", "n26.com", "hsbc.com", "barclays.co.uk", "lloydsbank.com", "natwest.com", "santander.com",
    "accounts.google.com", "login.microsoftonline.com", "login.live.com", "account.microsoft.com",
    "appleid.apple.com", "id.apple.com", "1password.com", "bitwarden.com", "lastpass.com", "dashlane.com",
    "okta.com", "auth0.com", "irs.gov", "login.gov", "id.me",
  ];
  const DENY_HOST_PREFIXES = ["login.", "signin.", "auth.", "accounts.", "account.", "id.", "sso.", "secure.", "banking.", "onlinebanking.", "netbanking."];
  /** Any host label (not the TLD) mentioning a bank or credit union — "mybank", "firstbank", "bank-x". */
  function bankyHost(host) {
    return host.split(".").slice(0, -1).some((label) => /bank|credit-?union/.test(label) && !/bankrupt/.test(label));
  }
  const DENY_PATH = /\/(login|log-in|signin|sign-in|signup|sign-up|auth|authorize|oauth|sso|checkout|payment|payments|pay|billing|password|reset-password|2fa|mfa|otp|verify)(\/|$|\?|#|\.)/i;

  /** "https://www.Example.com/a" or "example.com" → "example.com". Invalid → null. */
  function normalizeHost(input) {
    if (typeof input !== "string") return null;
    let s = input.trim().toLowerCase();
    if (!s) return null;
    try {
      if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = "https://" + s;
      const u = new URL(s);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      const h = u.hostname.replace(/^www\./, "").replace(/\.$/, "");
      if (!h || !/^[a-z0-9.-]+$/.test(h) || !h.includes(".") && h !== "localhost") return null;
      return h;
    } catch {
      return null;
    }
  }

  /** `host` equals `entry` or is a subdomain of it. */
  function hostMatches(host, entry) {
    if (!host || !entry) return false;
    return host === entry || host.endsWith("." + entry);
  }

  /** { denied, reason } for a page URL against the built-in list and the user's "never" list. */
  function isDeniedUrl(url, never = []) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { denied: true, reason: "not a web page" };
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { denied: true, reason: "not a web page" };
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (never.some((n) => hostMatches(host, n))) return { denied: true, reason: "you turned Lens off here" };
    if (BUILTIN_DENY.some((d) => hostMatches(host, d))) return { denied: true, reason: "banking, payment or sign-in site" };
    if (DENY_HOST_PREFIXES.some((p) => host.startsWith(p))) return { denied: true, reason: "sign-in site" };
    if (bankyHost(host)) return { denied: true, reason: "banking site" };
    if (DENY_PATH.test(u.pathname + u.search)) return { denied: true, reason: "sign-in or payment page" };
    return { denied: false, reason: "" };
  }

  /** Whether the selection button should run on `url` with these settings. */
  function buttonEnabledFor(settings, url) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    if (s.selectionButton === "off") return false;
    if (isDeniedUrl(url, s.never).denied) return false;
    if (s.selectionButton === "all") return true;
    const host = normalizeHost(url);
    return !!host && s.sites.some((x) => hostMatches(host, x));
  }

  /** Match patterns for scripting.registerContentScripts (and the permissions they need). */
  function contentScriptMatches(settings) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const forHost = (h) => [`https://${h}/*`, `http://${h}/*`, `https://*.${h}/*`, `http://*.${h}/*`];
    const excludeMatches = s.never.flatMap(forHost);
    if (s.selectionButton === "all") return { matches: ["https://*/*", "http://*/*"], excludeMatches };
    if (s.selectionButton === "sites") return { matches: s.sites.flatMap(forHost), excludeMatches };
    return { matches: [], excludeMatches: [] };
  }

  /** Origins to request with permissions.request for these settings. */
  function originsFor(settings) {
    return contentScriptMatches(settings).matches;
  }

  /**
   * Is this element (or what the selection sits in) somewhere Lens must not offer the button?
   * `el` is a plain description: { tag, type, autocomplete, contentEditable, attrs: {name: value}, ancestors: [same] }.
   */
  function isSensitiveField(el) {
    if (!el) return false;
    const chain = [el, ...(el.ancestors || [])];
    for (const n of chain) {
      const tag = String(n.tag || "").toUpperCase();
      const type = String(n.type || "").toLowerCase();
      const ac = String(n.autocomplete || "").toLowerCase();
      const attrs = n.attrs || {};
      if (tag === "INPUT" && (type === "password" || type === "hidden")) return true;
      if (/(current-password|new-password|one-time-code|cc-|credit-card)/.test(ac)) return true;
      const flagged = ["data-sensitive", "data-private", "data-lens-ignore"].some((a) => a in attrs && attrs[a] !== "false");
      if (flagged) return true;
      const label = String(attrs["aria-label"] || "") + " " + String(attrs.name || "") + " " + String(attrs.id || "");
      const editable = n.contentEditable === true || n.contentEditable === "true" || n.contentEditable === "plaintext-only";
      if ((editable || tag === "INPUT" || tag === "TEXTAREA") && /(password|passcode|pin\b|secret|otp|cvv|cvc|card.?number|ssn|social.?security)/i.test(label)) return true;
    }
    return false;
  }

  /** Any visible password field on the page turns the button off for that page. */
  function pageHasVisiblePassword(fields) {
    return (fields || []).some((f) => String(f.type || "").toLowerCase() === "password" && f.visible);
  }

  /** Selections worth offering: 2..50,000 characters with something other than whitespace. */
  function selectionTextOk(text) {
    if (typeof text !== "string") return false;
    const t = text.trim();
    return t.length >= 2 && t.length <= 50_000;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /**
   * Where to put the dot (document coordinates, top-left of the dot).
   * `rect`: the last client rect of the selection (viewport coordinates).
   * `vp`: { width, height, scrollX, scrollY }. Prefers just below the end of the selection;
   * flips above when there's no room; always stays inside the viewport.
   */
  function dotPosition(rect, vp, size = 22, gap = 6, margin = 4) {
    let left = rect.right + gap / 2;
    let top = rect.bottom + gap;
    let placement = "below";
    if (top + size > vp.height - margin) {
      top = rect.top - gap - size;
      placement = "above";
    }
    left = clamp(left, margin, vp.width - size - margin);
    top = clamp(top, margin, vp.height - size - margin);
    return { left: Math.round(left + vp.scrollX), top: Math.round(top + vp.scrollY), placement };
  }

  /**
   * Where to open the panel from the dot (document coordinates). Prefers below the dot and
   * aligned to its left edge; flips above or shifts left to stay fully inside the viewport.
   */
  function panelPosition(dot, panel, vp, margin = 8, gap = 8, dotSize = 22) {
    const dx = dot.left - vp.scrollX;
    const dy = dot.top - vp.scrollY;
    let top = dy + dotSize + gap;
    let placement = "below";
    if (top + panel.height > vp.height - margin && dy - gap - panel.height >= margin) {
      top = dy - gap - panel.height;
      placement = "above";
    }
    const left = clamp(dx - 12, margin, Math.max(margin, vp.width - panel.width - margin));
    top = clamp(top, margin, Math.max(margin, vp.height - panel.height - margin));
    return { left: Math.round(left + vp.scrollX), top: Math.round(top + vp.scrollY), placement };
  }

  /** Cleans a settings object from storage (unknown keys dropped, lists normalised). */
  function sanitizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    const list = (xs) => [...new Set((Array.isArray(xs) ? xs : []).map(normalizeHost).filter(Boolean))].slice(0, 500);
    return {
      selectionButton: ["off", "sites", "all"].includes(s.selectionButton) ? s.selectionButton : "off",
      sites: list(s.sites),
      never: list(s.never),
      defaultAction: TILE_ACTIONS.includes(s.defaultAction) ? s.defaultAction : "summarize",
    };
  }

  root.LensSel = {
    DEFAULT_SETTINGS, TILE_ACTIONS, BUILTIN_DENY, normalizeHost, hostMatches, isDeniedUrl, buttonEnabledFor,
    contentScriptMatches, originsFor, isSensitiveField, pageHasVisiblePassword, selectionTextOk, dotPosition,
    panelPosition, sanitizeSettings,
  };
})(globalThis);
