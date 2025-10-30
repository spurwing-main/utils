/*
Observer logic for video feature (modern browsers only)
*/

import { isVideo, getDocument } from "./internal-utils.js";
import { attr } from "./constants.js";

// Mutation observation setup: attach on add, detach on remove.
// Note: To keep the code minimal, we no longer auto-refresh on
// attribute changes. Authors can call Video.refresh(el) manually
// if they change configuration attributes after attach.
export function setupMutationObserver(Video, _INSTANCES) {
  const doc = getDocument();
  if (!doc) return null;

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.type !== "childList") continue;
      if (mutation.addedNodes) {
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          const node = mutation.addedNodes[j];
          if (node.nodeType !== 1) continue;
          if (isVideo(node) && node.hasAttribute(attr.src)) Video.attach(node);
          else if (node.querySelectorAll) {
            const videos = node.querySelectorAll(`video[${attr.src}]`);
            for (let k = 0; k < videos.length; k++) Video.attach(videos[k]);
          }
        }
      }
      if (mutation.removedNodes) {
        for (let j = 0; j < mutation.removedNodes.length; j++) {
          const node = mutation.removedNodes[j];
          if (node.nodeType !== 1) continue;
          if (isVideo(node)) Video.detach(node);
          else if (node.querySelectorAll) {
            const videos = node.querySelectorAll("video");
            for (let k = 0; k < videos.length; k++) Video.detach(videos[k]);
          }
        }
      }
    }
  });

  observer.observe(doc.documentElement || doc.body, {
    subtree: true,
    childList: true,
  });
  return observer;
}
