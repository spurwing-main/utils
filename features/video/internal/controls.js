/*
Control delegation functions for video feature
Extracted from features/video/index.js for better modularity
*/

import { isVideo, getDOC } from "./internal-utils.js";

import { A, logError } from "./constants.js";

function warn(...args) {
  logError("controls", args);
}

// Delegated controls - these handlers require INSTANCES to be passed
export function onControlClick(event, Video, INSTANCES) {
  const target = resolveActionFromEvent(event, INSTANCES);
  if (!target) return;
  const action = String(target.action || "").toLowerCase();
  const videos = target.videos;
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    if (action === "play") Video.play(video);
    else if (action === "pause") Video.pause(video);
    else Video.toggle(video);
  }
  event.preventDefault?.();
  event.stopPropagation?.();
}

export function onControlKeydown(event, Video, INSTANCES) {
  const key = event.key || event.code;
  if (key !== "Enter" && key !== " " && key !== "Spacebar") return;
  onControlClick(event, Video, INSTANCES);
}

function resolveActionTarget(startElement, INSTANCES) {
  const doc = getDOC();
  let element = startElement;
  while (element && element !== doc?.documentElement) {
    if (element?.hasAttribute?.(A.ACTION)) {
      const action = element.getAttribute(A.ACTION);
      const selector = element.getAttribute(A.TARGET);
      let targetVideos = [];
      if (selector) {
        try {
          targetVideos = Array.from(doc.querySelectorAll(selector)).filter(
            (node) => isVideo(node) && INSTANCES.has(node),
          );
        } catch {
          /* POLICY-EXCEPTION: invalid selector; fallback to nearest video */
        }
      }
      if (!targetVideos.length) {
        // nearest or descendant managed video (instance exists)
        let parent = element;
        while (parent && parent !== doc.documentElement) {
          if (isVideo(parent) && INSTANCES.has(parent)) {
            targetVideos = [parent];
            break;
          }
          const videoList = parent.querySelectorAll?.("video");
          if (videoList?.length) {
            for (let i = 0; i < videoList.length; i++) {
              const videoNode = videoList[i];
              if (INSTANCES.has(videoNode)) {
                targetVideos = [videoNode];
                break;
              }
            }
            if (targetVideos.length) break;
          }
          parent = parent.parentElement;
        }
      }
      if (!targetVideos.length) {
        warn("[video] control activated but no target video found");
        return null;
      }
      return { action, videos: targetVideos };
    }
    element = element.parentElement;
  }
  return null;
}

function resolveActionFromEvent(event, INSTANCES) {
  const eventPath = typeof event.composedPath === "function" ? event.composedPath() : null;
  if (Array.isArray(eventPath)) {
    for (let i = 0; i < eventPath.length; i++) {
      const node = eventPath[i];
      if (node && node.nodeType === 1 && node.hasAttribute?.(A.ACTION)) {
        const result = resolveActionTarget(node, INSTANCES);
        if (result) return result;
      }
    }
  }
  return resolveActionTarget(event.target, INSTANCES);
}

// Setup delegated control listeners
export function setupControlListeners(Video, INSTANCES) {
  const doc = getDOC();
  if (!doc) return undefined; // No-op teardown since no listeners were attached

  // Bound handlers with INSTANCES closed over
  const clickHandler = (e) => onControlClick(e, Video, INSTANCES);
  const keydownHandler = (e) => onControlKeydown(e, Video, INSTANCES);

  doc.addEventListener("click", clickHandler);
  doc.addEventListener("keydown", keydownHandler);

  // Return teardown function
  return () => {
    doc.removeEventListener("click", clickHandler);
    doc.removeEventListener("keydown", keydownHandler);
  };
}
