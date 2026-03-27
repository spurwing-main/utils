/*
Control delegation functions for video feature
Extracted from features/video/index.js for better modularity
*/

import { isVideo, getDocument } from "./internal-utils.js";

import { attr, logError } from "./constants.js";

function warn(...args) {
  logError("controls", args);
}

// Delegated controls - these handlers require INSTANCES to be passed
export function onControlClick(event, Video, INSTANCES) {
  const target = findActionFromEvent(event, INSTANCES);
  if (!target) return;

  const mute = String(target.mute || "").toLowerCase();
  const action = String(target.action || "").toLowerCase();
  const isValidAction =
    mute === "toggle" || action === "play" || action === "pause" || action === "restart" || action === "toggle";
  if (!isValidAction) {
    warn("[video] unsupported control action", { action, mute });
    return;
  }
  for (const video of target.videos) {
    if (mute === "toggle") Video.mute(video);
    else if (action === "play") Video.play(video);
    else if (action === "pause") Video.pause(video);
    else if (action === "restart") Video.restart(video);
    else if (action === "toggle") Video.toggle(video);
  }

  event.preventDefault?.();
  event.stopPropagation?.();
}

export function onControlKeydown(event, Video, INSTANCES) {
  const key = event.key || event.code;
  if (key !== "Enter" && key !== " " && key !== "Spacebar") return;
  onControlClick(event, Video, INSTANCES);
}

function findActionTarget(startElement, INSTANCES) {
  const doc = getDocument();
  let element = startElement;

  while (element && element !== doc?.documentElement) {
    const hasAction = element?.hasAttribute?.(attr.action);
    const hasMute = element?.hasAttribute?.(attr.mute);
    if (!hasAction && !hasMute) {
      element = element.parentElement;
      continue;
    }

    const action = hasAction ? element.getAttribute(attr.action) : null;
    const mute = hasMute ? element.getAttribute(attr.mute) : null;
    const selector = element.getAttribute(attr.target);

    // Try selector first
    if (selector) {
      try {
        const videos = Array.from(doc.querySelectorAll(selector)).filter(
          (node) => isVideo(node) && INSTANCES.has(node),
        );
        if (videos.length) return { action, mute, videos };
      } catch (e) {
        warn("[video] invalid selector in data-video-target:", selector, e);
        return null;
      }
    }

    // Find nearest managed video
    let parent = element;
    while (parent && parent !== doc.documentElement) {
      if (isVideo(parent) && INSTANCES.has(parent)) {
        return { action, mute, videos: [parent] };
      }

      const videos = parent.querySelectorAll?.("video");
      if (videos?.length) {
        for (const video of videos) {
          if (INSTANCES.has(video)) {
            return { action, mute, videos: [video] };
          }
        }
      }
      parent = parent.parentElement;
    }

    warn("[video] control activated but no target video found");
    return null;
  }
  return null;
}

function findActionFromEvent(event, INSTANCES) {
  const eventPath = typeof event.composedPath === "function" ? event.composedPath() : null;
  if (Array.isArray(eventPath)) {
    for (const node of eventPath) {
      if (node?.nodeType === 1 && node.hasAttribute?.(attr.action)) {
        const result = findActionTarget(node, INSTANCES);
        if (result) return result;
      }
    }
  }
  return findActionTarget(event.target, INSTANCES);
}

// Setup delegated control listeners
export function setupControlListeners(Video, INSTANCES) {
  const doc = getDocument();
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
