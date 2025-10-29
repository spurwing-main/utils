// Internal utility helpers for video feature (extracted to reduce index.js complexity)
export const getWIN = () => (typeof window !== "undefined" ? window : {});
export const getDOC = () => (typeof document !== "undefined" ? document : null);

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
  if (!s) return "300px 0px";
  return s;
}

export function closest(el, sel) {
  return el?.closest?.(sel) || null;
}

export function viewRatio(el, marginStr) {
  // SSR safety: check if element has getBoundingClientRect
  if (!el || typeof el.getBoundingClientRect !== "function") {
    return 0;
  }

  // Get the bounding rectangle of the element
  const rect = el.getBoundingClientRect();
  // Get viewport dimensions with fallbacks
  const viewportWidth = getWIN().innerWidth || getDOC()?.documentElement?.clientWidth || 0;
  const viewportHeight = getWIN().innerHeight || getDOC()?.documentElement?.clientHeight || 0;

  // Robustly parse margin string into numeric px values
  const marginParts = String(marginStr || "")
    .trim()
    .split(/\s+/)
    .map((part) => {
      // Extract numeric value from px units, fallback to 0 for invalid values
      const parsed = Number.parseFloat(String(part).replace(/px$/, "").trim());
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .filter((val) => Number.isFinite(val)); // Remove any remaining invalid values

  // Expand CSS margin shorthand (1-4 values) to top, right, bottom, left
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;

  if (marginParts.length >= 1) {
    top = right = bottom = left = marginParts[0];
  }
  if (marginParts.length >= 2) {
    top = bottom = marginParts[0];
    right = left = marginParts[1];
  }
  if (marginParts.length >= 3) {
    top = marginParts[0];
    right = left = marginParts[1];
    bottom = marginParts[2];
  }
  if (marginParts.length >= 4) {
    top = marginParts[0];
    right = marginParts[1];
    bottom = marginParts[2];
    left = marginParts[3];
  }

  // Calculate the viewport rectangle with margins applied
  const viewport = {
    top: -top,
    left: -left,
    right: viewportWidth + right,
    bottom: viewportHeight + bottom,
  };

  // Find intersection rectangle between element and viewport (with NaN guards)
  const intersectionLeft = Math.max(rect.left || 0, viewport.left);
  const intersectionTop = Math.max(rect.top || 0, viewport.top);
  const intersectionRight = Math.min(rect.right || 0, viewport.right);
  const intersectionBottom = Math.min(rect.bottom || 0, viewport.bottom);

  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft);
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);

  // If no intersection or invalid dimensions, ratio is 0
  if (
    intersectionWidth <= 0 ||
    intersectionHeight <= 0 ||
    !Number.isFinite(intersectionWidth) ||
    !Number.isFinite(intersectionHeight)
  ) {
    return 0;
  }

  // Calculate area of the element with protection against zero/negative values
  const elementWidth = Math.max(0, rect.width || 0);
  const elementHeight = Math.max(0, rect.height || 0);
  const elementArea = Math.max(1, elementWidth * elementHeight); // prevent division by zero

  // Return the ratio of intersection area to element area, with NaN guard
  const ratio = (intersectionWidth * intersectionHeight) / elementArea;
  return Number.isFinite(ratio) ? ratio : 0;
}
