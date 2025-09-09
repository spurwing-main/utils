// Internal utility helpers for video feature (extracted to reduce index.js complexity)
export const getWIN = () => typeof window !== 'undefined' ? window : {};
export const getDOC = () => typeof document !== 'undefined' ? document : null;

export function isVideo(el){
  return !!el && (el.tagName === 'VIDEO' || (typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement));
}

export function parseTokens(val){
  return String(val || '').toLowerCase().split(/\s+/).map(s => s.trim()).filter(Boolean);
}

function clamp01(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : (x > 1 ? 1 : x);
}

export function parseThresholdInput(val){
  const s = String(val || '').trim().toLowerCase();
  if (!s) return 0;
  if (s === 'any') return 0;
  if (s === 'half') return 0.5;
  if (s === 'full') return 1;
  const n = Number(s);
  return Number.isFinite(n) ? clamp01(n) : 0;
}

export function parseRootMargin(str){
  const s = String(str || '').trim();
  if (!s) return '300px 0px';
  return s;
}

function matchesSel(el, sel){
  const fn = el?.matches || el?.webkitMatchesSelector || el?.msMatchesSelector;
  return !!(fn && sel && fn.call(el, sel));
}

export function closest(el, sel){
  if (!el) return null;
  if (el.closest) return el.closest(sel);
  let p = el.parentElement;
  while (p){
    if (matchesSel(p, sel)) return p;
    p = p.parentElement;
  }
  return null;
}

export function viewRatio(el, marginStr){
  // SSR safety: check if element has getBoundingClientRect
  if (!el || typeof el.getBoundingClientRect !== 'function') {
    return 0;
  }

  // Get the bounding rectangle of the element
  const r = el.getBoundingClientRect();
  // Get viewport width and height with fallbacks
  const iw = getWIN().innerWidth || getDOC()?.documentElement?.clientWidth || 0;
  const ih = getWIN().innerHeight || getDOC()?.documentElement?.clientHeight || 0;

  // Robustly parse margin string into numeric px values
  const parts = String(marginStr || '').trim().split(/\s+/)
    .map(x => {
      // Extract numeric value from px units, fallback to 0 for invalid values
      const parsed = parseFloat(String(x).replace(/px$/, '').trim());
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .filter(val => Number.isFinite(val)); // Remove any remaining invalid values

  let t=0, rgt=0, b=0, l=0;
  // Expand CSS margin shorthand (1-4 values) to top, right, bottom, left
  if (parts.length >= 1){ t = rgt = b = l = parts[0]; }
  if (parts.length >= 2){ t = b = parts[0]; rgt = l = parts[1]; }
  if (parts.length >= 3){ t = parts[0]; rgt = l = parts[1]; b = parts[2]; }
  if (parts.length >= 4){ t = parts[0]; rgt = parts[1]; b = parts[2]; l = parts[3]; }

  // Calculate the viewport rectangle with margins applied
  const vw = { top: -t, left: -l, right: iw + rgt, bottom: ih + b };

  // Find intersection rectangle between element and viewport (with NaN guards)
  const interLeft = Math.max(r.left || 0, vw.left);
  const interTop = Math.max(r.top || 0, vw.top);
  const interRight = Math.min(r.right || 0, vw.right);
  const interBottom = Math.min(r.bottom || 0, vw.bottom);

  const interW = Math.max(0, interRight - interLeft);
  const interH = Math.max(0, interBottom - interTop);

  // If no intersection or invalid dimensions, ratio is 0
  if (interW <= 0 || interH <= 0 || !Number.isFinite(interW) || !Number.isFinite(interH)) {
    return 0;
  }

  // Calculate area of the element with protection against zero/negative values
  const elementWidth = Math.max(0, r.width || 0);
  const elementHeight = Math.max(0, r.height || 0);
  const area = Math.max(1, elementWidth * elementHeight); // prevent division by zero

  // Return the ratio of intersection area to element area, with NaN guard
  const ratio = (interW * interH) / area;
  return Number.isFinite(ratio) ? ratio : 0;
}