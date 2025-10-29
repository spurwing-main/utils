/* Marquee Feature – standalone smooth scrolling animation module */

const DBG =
  typeof window !== "undefined" ? window.__UTILS_DEBUG__?.createLogger?.("marquee") : null;

let _inited = false;

// WeakMap to track active marquee instances per container
const ACTIVE_INSTANCES = new WeakMap();

// Attribute name for marquee containers
const ATTR_MARQUEE = "data-marquee";
const ATTR_SPEED = "data-marquee-speed";

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

      // Listen for changes
      const handler = (e) => {
        this.prefersReducedMotion = e.matches;
        if (this.prefersReducedMotion && this.animationId) {
          this.stop();
        }
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", handler);
      } else if (mediaQuery.addListener) {
        // POLICY: Fallback for older browsers that don't support addEventListener
        mediaQuery.addListener(handler);
      }

      this.motionMediaQuery = mediaQuery;
      this.motionHandler = handler;
    } catch (e) {
      try {
        DBG?.warn("motion preference check failed", e);
      } catch (_) {}
      // POLICY: Default to allowing animation if detection fails
      this.prefersReducedMotion = false;
    }
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver === "undefined") {
      try {
        DBG?.info("ResizeObserver not available, skipping adaptive resize");
      } catch (_) {}
      return;
    }

    try {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.animationId) {
          // Recalculate on resize
          this._measureContent();
        }
      });
      this.resizeObserver.observe(this.container);
    } catch (e) {
      try {
        DBG?.warn("ResizeObserver setup failed", e);
      } catch (_) {}
      // POLICY: Continue without resize observer - animation will still work
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
      this.wrapper.style.display = "inline-flex";
      this.wrapper.style.whiteSpace = "nowrap";
      this.wrapper.style.position = "absolute";
      this.wrapper.style.left = "0";
      this.wrapper.style.top = "0";

      // Move existing content into wrapper
      while (this.container.firstChild) {
        this.wrapper.appendChild(this.container.firstChild);
      }

      this.container.appendChild(this.wrapper);

      // Measure content width
      this._measureContent();

      // Clone content for seamless loop
      this._createClones();

      try {
        DBG?.info("container prepared", { contentWidth: this.contentWidth });
      } catch (_) {}

      return true;
    } catch (e) {
      try {
        DBG?.error("container preparation failed", e);
      } catch (_) {}
      // POLICY: Return false instead of throwing to allow graceful handling
      return false;
    }
  }

  _measureContent() {
    try {
      // Get the width of the original content
      const children = Array.from(this.wrapper.children);
      const originalChildren = children.filter((el) => !el.hasAttribute("data-marquee-clone"));

      if (originalChildren.length === 0) {
        this.contentWidth = this.wrapper.scrollWidth || 100;
      } else {
        this.contentWidth = originalChildren.reduce((total, el) => {
          return total + (el.offsetWidth || 100);
        }, 0);
      }

      // POLICY: Ensure we have a minimum width to avoid division by zero
      if (this.contentWidth === 0) {
        this.contentWidth = 100;
      }
    } catch (e) {
      try {
        DBG?.warn("content measurement failed", e);
      } catch (_) {}
      // POLICY: Fallback to reasonable default if measurement fails
      this.contentWidth = 100;
    }
  }

  _createClones() {
    try {
      // Remove existing clones
      for (const clone of this.clones) {
        try {
          if (clone?.parentNode) {
            clone.parentNode.removeChild(clone);
          }
        } catch (_) {
          // POLICY-EXCEPTION: Silent removal of clones that may no longer exist
        }
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
      try {
        DBG?.warn("clone creation failed", e);
      } catch (_) {}
      // POLICY: Continue without clones - single pass animation still works
    }
  }

  _animate(speed = 1) {
    if (this.prefersReducedMotion) {
      try {
        DBG?.info("animation skipped due to reduced motion preference");
      } catch (_) {}
      return;
    }

    // POLICY: Ensure performance.now is available, fallback to Date.now
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? () => performance.now()
        : () => Date.now();

    let lastTime = now();

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
        if (this.wrapper) {
          this.wrapper.style.transform = `translateX(-${this.offset}px)`;
        }

        // Continue animation
        this.animationId = requestAnimationFrame(tick);
      } catch (e) {
        try {
          DBG?.error("animation tick failed", e);
        } catch (_) {}
        // POLICY: Stop animation on error to prevent endless error loop
        this.stop();
      }
    };

    this.animationId = requestAnimationFrame(tick);
  }

  start(options = {}) {
    try {
      if (this.animationId) {
        try {
          DBG?.info("animation already running");
        } catch (_) {}
        return;
      }

      if (!this.wrapper) {
        const prepared = this._prepareContainer();
        if (!prepared) {
          try {
            DBG?.error("failed to prepare container, aborting start");
          } catch (_) {}
          return;
        }
      }

      const speed = options.speed || 1;
      this._animate(speed);

      try {
        DBG?.info("marquee started", { speed });
      } catch (_) {}
    } catch (e) {
      try {
        DBG?.error("start failed", e);
      } catch (_) {}
      // POLICY: Clean up on error
      this.stop();
    }
  }

  stop() {
    try {
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
        try {
          this.resizeObserver.disconnect();
        } catch (_) {
          // POLICY-EXCEPTION: Observer may already be disconnected
        }
        this.resizeObserver = null;
      }

      // Clean up motion preference listener
      if (this.motionMediaQuery && this.motionHandler) {
        try {
          if (this.motionMediaQuery.removeEventListener) {
            this.motionMediaQuery.removeEventListener("change", this.motionHandler);
          } else if (this.motionMediaQuery.removeListener) {
            // POLICY: Fallback for older browsers
            this.motionMediaQuery.removeListener(this.motionHandler);
          }
        } catch (_) {
          // POLICY-EXCEPTION: Listener may not exist or already removed
        }
      }

      // Reset state
      this.wrapper = null;
      this.clones = [];
      this.offset = 0;

      try {
        DBG?.info("marquee stopped and cleaned up");
      } catch (_) {}
    } catch (e) {
      try {
        DBG?.error("stop/cleanup failed", e);
      } catch (_) {}
      // POLICY: Best effort cleanup - don't throw
    }
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
  if (!root || !root.querySelectorAll) return [];
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
      try {
        DBG?.warn("invalid container element");
      } catch (_) {}
      return;
    }

    try {
      // Check if already attached
      if (ACTIVE_INSTANCES.has(container)) {
        try {
          DBG?.info("marquee already attached to element");
        } catch (_) {}
        return;
      }

      const instance = new MarqueeInstance(container);
      ACTIVE_INSTANCES.set(container, instance);

      const speed = getSpeed(container);
      instance.start({ speed });

      try {
        DBG?.info("marquee attached", { speed });
      } catch (_) {}
    } catch (e) {
      try {
        DBG?.error("Marquee.attach failed", e);
      } catch (_) {}
      // POLICY: Return gracefully on error
    }
  },

  /**
   * Detach marquee from a specific element
   * @param {HTMLElement} container - The container element to stop
   * @internal Use rescan() to automatically manage elements
   */
  detach(container) {
    if (!isValidContainer(container)) {
      try {
        DBG?.warn("invalid container element");
      } catch (_) {}
      return;
    }

    try {
      const instance = ACTIVE_INSTANCES.get(container);
      if (instance) {
        instance.stop();
        ACTIVE_INSTANCES.delete(container);
        try {
          DBG?.info("marquee detached");
        } catch (_) {}
      }
    } catch (e) {
      try {
        DBG?.error("Marquee.detach failed", e);
      } catch (_) {}
      // POLICY: Return gracefully on error
    }
  },

  /**
   * Rescan document for marquee elements and sync state
   * - Attaches new elements with data-marquee attribute
   * - Detaches elements that no longer have data-marquee attribute
   * @param {Document|Element} root - Optional root element to scan from (defaults to document)
   */
  rescan(root = document) {
    try {
      // Find all current marquee elements
      const currentElements = findMarqueeElements(root);

      // Detach instances that no longer have the attribute
      const toDetach = [];
      for (const [element] of ACTIVE_INSTANCES) {
        // Check if element still has the attribute
        if (!element.hasAttribute(ATTR_MARQUEE)) {
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

      try {
        DBG?.info("rescan completed", {
          found: currentElements.length,
          attached: currentElements.filter((el) => ACTIVE_INSTANCES.has(el)).length,
          detached: toDetach.length,
        });
      } catch (_) {}
    } catch (e) {
      try {
        DBG?.error("Marquee.rescan failed", e);
      } catch (_) {}
      // POLICY: Return gracefully on error
    }
  },
};

/**
 * Idempotent initialization function
 * Performs initial scan for marquee elements
 */
export function init() {
  if (_inited) return;
  _inited = true;

  try {
    DBG?.info("marquee feature initialized");
    // Perform initial rescan to attach to any existing elements
    Marquee.rescan();
  } catch (e) {
    try {
      DBG?.error("marquee init failed", e);
    } catch (_) {}
  }
}

export default { init, Marquee };
