/* Marquee Feature – standalone smooth scrolling animation module */

const DBG =
  typeof window !== "undefined" ? window.__UTILS_DEBUG__?.createLogger?.("marquee") : null;

let _inited = false;

// WeakMap to track active marquee instances per container
const ACTIVE_INSTANCES = new WeakMap();
// Set to track which elements have active instances (for iteration)
const TRACKED_ELEMENTS = new Set();

// Attribute name for marquee containers
const ATTR_MARQUEE = "data-marquee";
const ATTR_SPEED = "data-marquee-speed";

// Performance: reusable time function (modern browsers only)
const getTime = () => performance.now();

/**
 * MarqueeInstance manages the animation lifecycle for a single container
 */
class MarqueeInstance {
  constructor(container) {
    this.container = container;
    this.originalHTML = null;
    this.wrapper = null;
    this.clones = [];
    this.animationId = null;
    this.offset = 0;
    this.contentWidth = 0;
    this.resizeObserver = null;
    this.prefersReducedMotion = false;

    this._checkMotionPreference();
    this._setupResizeObserver();
  }

  _checkMotionPreference() {
    try {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.prefersReducedMotion = mediaQuery.matches;

      // Listen for changes (modern browsers only)
      const handler = (e) => {
        this.prefersReducedMotion = e.matches;
        if (this.prefersReducedMotion && this.animationId) {
          this.stop();
        }
      };

      mediaQuery.addEventListener("change", handler);
      this.motionMediaQuery = mediaQuery;
      this.motionHandler = handler;
    } catch (e) {
      DBG?.warn("motion preference check failed", e);
      this.prefersReducedMotion = false;
    }
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver === "undefined") {
      DBG?.info("ResizeObserver not available, skipping adaptive resize");
      return;
    }

    try {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.animationId) {
          this._measureContent();
          this._createClones(); // Recreate clones when size changes
        }
      });
      this.resizeObserver.observe(this.container);
    } catch (e) {
      DBG?.warn("ResizeObserver setup failed", e);
    }
  }

  _prepareContainer() {
    try {
      // Save original state
      this.originalHTML = this.container.innerHTML;
      this.originalOverflow = this.container.style.overflow;
      this.originalPosition = this.container.style.position;

      // Setup container for scrolling
      this.container.style.overflow = "hidden";
      if (!this.container.style.position || this.container.style.position === "static") {
        this.container.style.position = "relative";
      }

      // Create wrapper for content
      this.wrapper = document.createElement("div");
      this.wrapper.style.cssText =
        "display:inline-flex;white-space:nowrap;position:absolute;left:0;top:0;will-change:transform";

      // Move existing content into wrapper
      while (this.container.firstChild) {
        this.wrapper.appendChild(this.container.firstChild);
      }

      this.container.appendChild(this.wrapper);

      // Measure content width
      this._measureContent();

      // Clone content for seamless loop
      this._createClones();

      DBG?.info("container prepared", { contentWidth: this.contentWidth });
      return true;
    } catch (e) {
      DBG?.error("container preparation failed", e);
      return false;
    }
  }

  _measureContent() {
    try {
      const children = Array.from(this.wrapper.children);
      const originalChildren = children.filter((el) => !el.hasAttribute("data-marquee-clone"));

      if (originalChildren.length === 0) {
        this.contentWidth = this.wrapper.scrollWidth || 100;
      } else {
        this.contentWidth = originalChildren.reduce(
          (total, el) => total + (el.offsetWidth || 100),
          0,
        );
      }

      // Ensure we have a minimum width to avoid division by zero
      if (this.contentWidth === 0) this.contentWidth = 100;
    } catch (e) {
      DBG?.warn("content measurement failed", e);
      this.contentWidth = 100;
    }
  }

  _createClones() {
    try {
      // Remove existing clones
      for (const clone of this.clones) {
        clone?.parentNode?.removeChild(clone);
      }
      this.clones = [];

      // Get original children (non-clones)
      const originalChildren = Array.from(this.wrapper.children).filter(
        (el) => !el.hasAttribute("data-marquee-clone"),
      );

      // Create enough clones to ensure seamless loop
      const containerWidth = this.container.offsetWidth || 300;
      const clonesNeeded = Math.max(1, Math.ceil(containerWidth / this.contentWidth) + 1);

      for (let i = 0; i < clonesNeeded; i++) {
        for (const child of originalChildren) {
          const clone = child.cloneNode(true);
          clone.setAttribute("data-marquee-clone", "true");
          clone.setAttribute("aria-hidden", "true");
          this.wrapper.appendChild(clone);
          this.clones.push(clone);
        }
      }
    } catch (e) {
      DBG?.warn("clone creation failed", e);
    }
  }

  _animate(speed = 1) {
    if (this.prefersReducedMotion) {
      DBG?.info("animation skipped due to reduced motion preference");
      return;
    }

    // Guard for test environments without requestAnimationFrame
    if (typeof requestAnimationFrame === "undefined") {
      DBG?.warn("requestAnimationFrame not available");
      return;
    }

    let lastTime = getTime();

    const tick = (currentTime) => {
      try {
        const delta = currentTime - lastTime;
        lastTime = currentTime;

        // Move by speed pixels per frame (adjusted for frame time)
        this.offset += (speed * delta) / 16.67; // normalize to 60fps

        // Reset when we've scrolled one full content width
        if (this.offset >= this.contentWidth) {
          this.offset -= this.contentWidth;
        }

        // Update position
        this.wrapper.style.transform = `translateX(-${this.offset}px)`;

        // Continue animation
        this.animationId = requestAnimationFrame(tick);
      } catch (e) {
        DBG?.error("animation tick failed", e);
        this.stop();
      }
    };

    this.animationId = requestAnimationFrame(tick);
  }

  start(options = {}) {
    if (this.animationId) {
      DBG?.info("animation already running");
      return;
    }

    if (!this.wrapper && !this._prepareContainer()) {
      DBG?.error("failed to prepare container, aborting start");
      return;
    }

    const speed = options.speed || 1;
    this._animate(speed);
    DBG?.info("marquee started", { speed });
  }

  stop() {
    // Cancel animation
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Restore original DOM
    if (this.originalHTML !== null) {
      this.container.innerHTML = this.originalHTML;
      this.originalHTML = null;
    }

    // Restore container styles
    if (this.originalOverflow !== undefined) {
      this.container.style.overflow = this.originalOverflow;
    }
    if (this.originalPosition !== undefined) {
      this.container.style.position = this.originalPosition;
    }

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up motion preference listener
    if (this.motionMediaQuery && this.motionHandler) {
      this.motionMediaQuery.removeEventListener("change", this.motionHandler);
    }

    // Reset state
    this.wrapper = null;
    this.clones = [];
    this.offset = 0;

    DBG?.info("marquee stopped and cleaned up");
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
  const speedAttr = element.getAttribute(ATTR_SPEED);
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
  return Array.from(root.querySelectorAll(`[${ATTR_MARQUEE}]`));
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
      DBG?.warn("invalid container element");
      return;
    }

    // Check if already attached
    if (ACTIVE_INSTANCES.has(container)) {
      DBG?.info("marquee already attached to element");
      return;
    }

    const instance = new MarqueeInstance(container);
    ACTIVE_INSTANCES.set(container, instance);
    TRACKED_ELEMENTS.add(container);

    const speed = getSpeed(container);
    instance.start({ speed });

    DBG?.info("marquee attached", { speed });
  },

  /**
   * Detach marquee from a specific element
   * @param {HTMLElement} container - The container element to stop
   * @internal Use rescan() to automatically manage elements
   */
  detach(container) {
    if (!isValidContainer(container)) {
      DBG?.warn("invalid container element");
      return;
    }

    const instance = ACTIVE_INSTANCES.get(container);
    if (instance) {
      instance.stop();
      ACTIVE_INSTANCES.delete(container);
      TRACKED_ELEMENTS.delete(container);
      DBG?.info("marquee detached");
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

    // Detach instances that no longer have the attribute or are not in document
    const toDetach = [];
    for (const element of TRACKED_ELEMENTS) {
      if (!element.hasAttribute(ATTR_MARQUEE) || !document.contains(element)) {
        toDetach.push(element);
      }
    }

    for (const element of toDetach) {
      this.detach(element);
    }

    // Attach new elements
    for (const element of currentElements) {
      if (!ACTIVE_INSTANCES.has(element)) {
        this.attach(element);
      }
    }

    DBG?.info("rescan completed", {
      found: currentElements.length,
      attached: currentElements.filter((el) => ACTIVE_INSTANCES.has(el)).length,
      detached: toDetach.length,
    });
  },
};

/**
 * Idempotent initialization function
 * Performs initial scan for marquee elements
 */
export function init() {
  if (_inited) return;
  _inited = true;

  DBG?.info("marquee feature initialized");
  Marquee.rescan();
}

export default { init, Marquee };
