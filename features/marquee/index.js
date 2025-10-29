/* Marquee Feature – standalone smooth scrolling animation module */

const debug =
  typeof window !== "undefined" ? window.__UTILS_DEBUG__?.createLogger?.("marquee") : null;

let inited = false;
const activeInstances = new WeakMap();
const trackedElements = new Set();

const attrMarquee = "data-marquee";
const attrSpeed = "data-marquee-speed";

/**
 * MarqueeInstance manages the animation lifecycle for a single container
 */
class MarqueeInstance {
  constructor(container) {
    this.container = container;
    this.wrapper = null;
    this.clones = [];
    this.animationId = null;
    this.offset = 0;
    this.contentWidth = 0;
    this.resizeObserver = null;
    this.resizeThrottleId = null;
    this.prefersReducedMotion = false;

    this._checkMotionPreference();
    this._setupResizeObserver();
    this._setupFontLoadObserver();
    this._setupImageLoadObserver();
  }

  _checkMotionPreference() {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.prefersReducedMotion = mediaQuery.matches;

    const handler = (e) => {
      this.prefersReducedMotion = e.matches;
      if (this.prefersReducedMotion && this.animationId) {
        this.stop();
      }
    };

    mediaQuery.addEventListener("change", handler);
    this.motionMediaQuery = mediaQuery;
    this.motionHandler = handler;
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver === "undefined") return;

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.animationId) return;

      if (this.resizeThrottleId) clearTimeout(this.resizeThrottleId);

      this.resizeThrottleId = setTimeout(() => {
        this._measureContent();
        this._createClones();
        this.resizeThrottleId = null;
      }, 150);
    });
    this.resizeObserver.observe(this.container);
  }

  _setupFontLoadObserver() {
    if (!document.fonts?.ready) return;

    document.fonts.ready.then(() => {
      if (this.animationId) {
        this._measureContent();
        this._createClones();
      }
    });
  }

  _setupImageLoadObserver() {
    if (!this.container) return;

    const images = this.container.querySelectorAll("img");
    let pendingImages = 0;

    const handleImageLoad = () => {
      pendingImages--;
      if (pendingImages === 0 && this.animationId) {
        this._measureContent();
        this._createClones();
      }
    };

    for (const img of images) {
      if (img.complete && img.naturalHeight !== 0) continue;

      pendingImages++;
      const onLoad = () => {
        handleImageLoad();
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onLoad);
      };

      img.addEventListener("load", onLoad, { once: true, passive: true });
      img.addEventListener("error", onLoad, { once: true, passive: true });
    }
  }

  _prepareContainer() {
    // Save original state
    this.originalOverflow = this.container.style.overflow;
    this.originalPosition = this.container.style.position;

    // Setup container
    this.container.style.overflow = "hidden";
    if (!this.container.style.position || this.container.style.position === "static") {
      this.container.style.position = "relative";
    }

    // Create wrapper
    this.wrapper = document.createElement("div");
    this.wrapper.style.cssText =
      "display:inline-flex;white-space:nowrap;position:absolute;left:0;top:0;will-change:transform";

    // Move content into wrapper
    while (this.container.firstChild) {
      this.wrapper.appendChild(this.container.firstChild);
    }

    this.container.appendChild(this.wrapper);
    this._measureContent();
    this._createClones();

    return true;
  }

  _measureContent() {
    const originalChildren = Array.from(this.wrapper.children).filter(
      (el) => !el.hasAttribute("data-marquee-clone"),
    );

    if (originalChildren.length === 0) {
      this.contentWidth = this.wrapper.scrollWidth || 100;
    } else {
      this.contentWidth = originalChildren.reduce(
        (total, el) => total + (el.offsetWidth || 100),
        0,
      );
    }

    // Prevent division by zero
    if (this.contentWidth === 0) this.contentWidth = 100;
  }

  _createClones() {
    // Remove existing clones
    for (const clone of this.clones) {
      clone?.remove();
    }
    this.clones.length = 0;

    const originalChildren = Array.from(this.wrapper.children).filter(
      (el) => !el.hasAttribute("data-marquee-clone"),
    );

    // Calculate clones needed for seamless loop
    const containerWidth = this.container.offsetWidth || 300;
    const clonesNeeded = Math.max(1, Math.ceil(containerWidth / this.contentWidth) + 1);

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < clonesNeeded; i++) {
      for (const child of originalChildren) {
        const clone = child.cloneNode(true);
        clone.setAttribute("data-marquee-clone", "true");
        clone.setAttribute("aria-hidden", "true");
        if (clone.id) clone.removeAttribute("id");

        disableCloneInteractivity(clone);
        fragment.appendChild(clone);
        this.clones.push(clone);
      }
    }

    this.wrapper.appendChild(fragment);
  }

  _animate(speed = 1) {
    if (this.prefersReducedMotion) {
      debug?.info("animation skipped due to reduced motion preference");
      return;
    }

    // Guard for test environments without requestAnimationFrame
    if (typeof requestAnimationFrame === "undefined") {
      debug?.warn("requestAnimationFrame not available");
      return;
    }

    const speedPerMs = speed / 16.67; // Pre-calculate for performance
    let lastTime = null; // Initialize on first frame to avoid timing mismatch

    const tick = (currentTime) => {
      // Initialize lastTime on first frame to sync with requestAnimationFrame timing
      if (lastTime === null) {
        lastTime = currentTime;
      }

      const delta = currentTime - lastTime;
      lastTime = currentTime;

      // Move by speed pixels per frame (adjusted for frame time)
      this.offset += speedPerMs * delta;

      // Reset when we've scrolled one full content width
      if (this.offset >= this.contentWidth) {
        this.offset -= this.contentWidth;
      }

      // Update position - avoid string interpolation in hot path
      this.wrapper.style.transform = `translateX(-${this.offset}px)`;

      // Continue animation
      this.animationId = requestAnimationFrame(tick);
    };

    this.animationId = requestAnimationFrame(tick);
  }

  start(options = {}) {
    if (this.animationId) {
      debug?.info("animation already running");
      return;
    }

    if (!this.wrapper && !this._prepareContainer()) {
      debug?.error("failed to prepare container, aborting start");
      return;
    }

    const speed = options.speed || 1;
    this._animate(speed);
    debug?.info("marquee started", { speed });
  }

  stop() {
    // Cancel animation
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.resizeThrottleId !== null) {
      clearTimeout(this.resizeThrottleId);
      this.resizeThrottleId = null;
    }

    // Restore original DOM structure without losing event listeners
    if (this.wrapper) {
      while (this.wrapper.firstChild) {
        const node = this.wrapper.firstChild;
        if (node.nodeType === 1 && node.hasAttribute("data-marquee-clone")) {
          node.remove();
        } else {
          this.container.appendChild(node);
        }
      }
      this.wrapper.remove();
    }

    // Restore container styles
    if (this.originalOverflow !== undefined) {
      this.container.style.overflow = this.originalOverflow;
      this.originalOverflow = undefined;
    }
    if (this.originalPosition !== undefined) {
      this.container.style.position = this.originalPosition;
      this.originalPosition = undefined;
    }

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up motion preference listener - prevent memory leaks
    if (this.motionMediaQuery && this.motionHandler) {
      this.motionMediaQuery.removeEventListener("change", this.motionHandler);
      this.motionMediaQuery = null;
      this.motionHandler = null;
    }

    // Reset state
    this.wrapper = null;
    this.clones.length = 0; // Clear array efficiently
    this.offset = 0;

    debug?.info("marquee stopped and cleaned up");
  }
}

const FOCUSABLE_SELECTOR =
  "a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

function disableCloneInteractivity(node) {
  if (!node || node.nodeType !== 1) return;
  const element = node;

  if ("inert" in element) {
    try {
      element.inert = true;
    } catch (e) {
      debug?.warn("failed to set inert on clone", e);
    }
  }

  if (element.matches?.(FOCUSABLE_SELECTOR)) {
    element.setAttribute("tabindex", "-1");
  }

  for (const focusable of element.querySelectorAll?.(FOCUSABLE_SELECTOR) ?? []) {
    focusable.setAttribute("tabindex", "-1");
    focusable.setAttribute("aria-hidden", "true");
  }
}

/**
 * Helper: Validate container element
 * @param {any} container - Element to validate
 * @returns {boolean} True if valid element node
 */
function isValidContainer(container) {
  return container?.nodeType && container.nodeType === 1;
}

/**
 * Helper: Get speed from element attribute or default
 * @param {Element} element - Element to read speed from
 * @returns {number} Speed in pixels per frame at 60fps
 */
function getSpeed(element) {
  const speedAttr = element.getAttribute(attrSpeed);
  if (speedAttr) {
    const speed = Number.parseFloat(speedAttr);
    if (!Number.isNaN(speed) && speed > 0) {
      return speed;
    }
  }
  return 1; // Default speed: 1 pixel per frame at 60fps
}

/**
 * Helper: Find all marquee elements in document
 * @param {Document|Element} root - Root element to search from
 * @returns {Array<Element>} Array of marquee elements
 */
function findMarqueeElements(root = document) {
  if (!root?.querySelectorAll) return [];
  return Array.from(root.querySelectorAll(`[${attrMarquee}]`));
}

/**
 * Public API for marquee feature
 */
export const Marquee = {
  /**
   * Attach marquee to a specific element
   * @param {HTMLElement} container - The container element to animate
   * @internal Use rescan() to discover elements via attributes
   */
  attach(container) {
    if (!isValidContainer(container)) {
      debug?.warn("invalid container element");
      return;
    }

    // Check if already attached
    if (activeInstances.has(container)) {
      debug?.info("marquee already attached to element");
      return;
    }

    const instance = new MarqueeInstance(container);
    activeInstances.set(container, instance);
    trackedElements.add(container);

    const speed = getSpeed(container);
    instance.start({ speed });

    debug?.info("marquee attached", { speed });
  },

  /**
   * Detach marquee from a specific element
   * @param {HTMLElement} container - The container element to stop
   * @internal Use rescan() to automatically manage elements
   */
  detach(container) {
    if (!isValidContainer(container)) {
      debug?.warn("invalid container element");
      return;
    }

    const instance = activeInstances.get(container);
    if (instance) {
      instance.stop();
      activeInstances.delete(container);
      trackedElements.delete(container);
      debug?.info("marquee detached");
    }
  },

  /**
   * Rescan document for marquee elements and sync state
   * - Attaches new elements with data-marquee attribute
   * - Detaches elements that no longer have data-marquee attribute
   * @param {Document|Element} root - Optional root element to scan from (defaults to document)
   */
  rescan(root = document) {
    // Find all current marquee elements
    const currentElements = findMarqueeElements(root);
    const currentSet = new Set(currentElements);

    // Detach instances that no longer have the attribute or are not in document
    const toDetach = [];
    for (const element of trackedElements) {
      if (!currentSet.has(element) || !document.contains(element)) {
        toDetach.push(element);
      }
    }

    // Batch detach for efficiency
    for (const element of toDetach) {
      this.detach(element);
    }

    // Batch attach new elements
    let attached = 0;
    for (const element of currentElements) {
      if (!activeInstances.has(element)) {
        this.attach(element);
        attached++;
      }
    }

    debug?.info("rescan completed", {
      found: currentElements.length,
      attached,
      detached: toDetach.length,
    });
  },
};

/**
 * Idempotent initialization function
 * Performs initial scan for marquee elements
 */
export function init() {
  if (inited) return;
  inited = true;

  // Expose Marquee globally for browser usage
  if (typeof window !== "undefined") {
    window.Marquee = Marquee;
  }

  debug?.info("marquee feature initialized");
  Marquee.rescan();
}

export default { init, Marquee };
