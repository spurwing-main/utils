// Internal utility helpers for video feature (extracted to reduce index.js complexity)
import { DEFAULT_ROOT_MARGIN } from "./constants.js";

export const getWindow = () => (typeof window !== "undefined" ? window : {});
export const getDocument = () => (typeof document !== "undefined" ? document : null);

export function isVideo(el) {
  return !!el && el.tagName === "VIDEO";
}

export function parseTokens(val) {
  return String(val || "")
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function parseThresholdInput(val) {
  const s = String(val || "")
    .trim()
    .toLowerCase();
  if (!s) return 0;
  if (s === "any") return 0;
  if (s === "half") return 0.5;
  if (s === "full") return 1;
  const n = Number(s);
  return Number.isFinite(n) ? clamp01(n) : 0;
}

export function parseRootMargin(str) {
  const s = String(str || "").trim();
  if (!s) return DEFAULT_ROOT_MARGIN;
  return s;
}

export function closest(el, sel) {
  return el?.closest?.(sel) || null;
}
