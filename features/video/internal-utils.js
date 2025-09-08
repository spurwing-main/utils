// Internal utility helpers for video feature (extracted to reduce index.js complexity)
const WIN = typeof window !== 'undefined' ? window : {};
const DOC = typeof document !== 'undefined' ? document : null;

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
  // Get the bounding rectangle of the element
  const r = el.getBoundingClientRect();
  // Get viewport width and height
  const iw = WIN.innerWidth || DOC?.documentElement?.clientWidth || 0;
  const ih = WIN.innerHeight || DOC?.documentElement?.clientHeight || 0;
  // Parse margin string into numeric values (px)
  const parts = String(marginStr || '').trim().split(/\s+/).map(x => parseFloat(String(x).replace('px','')) || 0);
  let t=0,rgt=0,b=0,l=0;
  // Expand margin shorthand (1-4 values) to top, right, bottom, left
  if (parts.length === 1){ t=rgt=b=l=parts[0]; }
  else if (parts.length === 2){ t=b=parts[0]; rgt=l=parts[1]; }
  else if (parts.length === 3){ t=parts[0]; rgt=l=parts[1]; b=parts[2]; }
  else { t=parts[0]; rgt=parts[1]; b=parts[2]; l=parts[3]; }
  // Calculate the viewport rectangle with margins applied
  const vw = { top: -t, left: -l, right: iw + rgt, bottom: ih + b };
  // Find intersection rectangle between element and viewport
  const interLeft = Math.max(r.left, vw.left);
  const interTop = Math.max(r.top, vw.top);
  const interRight = Math.min(r.right, vw.right);
  const interBottom = Math.min(r.bottom, vw.bottom);
  const interW = Math.max(0, interRight - interLeft);
  const interH = Math.max(0, interBottom - interTop);
  // If no intersection, ratio is 0
  if (interW <= 0 || interH <= 0) return 0;
  // Calculate area of the element (avoid division by zero)
  const area = Math.max(1, r.width * r.height);
  // Return the ratio of intersection area to element area
  return (interW * interH) / area;
}