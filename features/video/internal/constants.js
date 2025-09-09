// Shared attribute names and centralized error logging for video feature

export const A = Object.freeze({
  SRC: "data-video-src",
  SRC_MOB: "data-video-mob-src",
  PRELOAD: "data-video-preload",
  RESTART: "data-video-play-restart",
  LOAD_WHEN: "data-video-load-when",
  PLAY_WHEN: "data-video-play-when",
  PAUSE_WHEN: "data-video-pause-when",
  PARENT_POINTER: "data-video-parent-pointer",
  THRESHOLD: "data-video-scroll-threshold",
  MARGIN: "data-video-scroll-margin",
  MUTED: "data-video-muted",
  ACTION: "data-video-action",
  TARGET: "data-video-target",
});

// Centralized error logger for video feature
export function logError(context, error) {
  try {
    const DBG =
      typeof window !== "undefined" ? window?.__UTILS_DEBUG__?.createLogger?.("video") : null;
    DBG?.warn(`[video] ${context}`, error);
  } catch {
    // POLICY-EXCEPTION: debug logger unavailable
  }
}
