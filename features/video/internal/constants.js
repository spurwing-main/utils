export const attr = {
  src: "data-video-src",
  srcMob: "data-video-mob-src",
  preload: "data-video-preload",
  restartWhen: "data-video-restart-when",
  loadWhen: "data-video-load-when",
  playWhen: "data-video-play-when",
  pauseWhen: "data-video-pause-when",
  parentPointer: "data-video-parent-pointer",
  threshold: "data-video-scroll-threshold",
  margin: "data-video-scroll-margin",
  muted: "data-video-muted",
  action: "data-video-action",
  target: "data-video-target",
};

export function logError(context, error) {
  const debug =
    typeof window !== "undefined" ? window?.__UTILS_DEBUG__?.createLogger?.("video") : null;
  debug?.warn(`[video] ${context}`, error);
}
