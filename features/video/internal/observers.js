/*
Observer logic for video feature (modern browsers only)
*/

import { isVideo, getDOC } from "./internal-utils.js";
import { A } from "./constants.js";

// Mutation observation setup: attach on add, detach on remove.
// Note: To keep the code minimal, we no longer auto-refresh on
// attribute changes. Authors can call Video.refresh(el) manually
// if they change configuration attributes after attach.
export function setupMutationObserver(Video, _INSTANCES) {
  const doc = getDOC();
  if (!doc) return null;

  const mo = new MutationObserver((list) => {
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.type !== "childList") continue;
      if (m.addedNodes) {
        for (let j = 0; j < m.addedNodes.length; j++) {
          const n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (isVideo(n) && n.hasAttribute(A.SRC)) Video.attach(n);
          else if (n.querySelectorAll) {
            const vids = n.querySelectorAll(`video[${A.SRC}]`);
            for (let k = 0; k < vids.length; k++) Video.attach(vids[k]);
          }
        }
      }
      if (m.removedNodes) {
        for (let j = 0; j < m.removedNodes.length; j++) {
          const n = m.removedNodes[j];
          if (n.nodeType !== 1) continue;
          if (isVideo(n)) Video.detach(n);
          else if (n.querySelectorAll) {
            const vids = n.querySelectorAll("video");
            for (let k = 0; k < vids.length; k++) Video.detach(vids[k]);
          }
        }
      }
    }
  });

  mo.observe(doc.documentElement || doc.body, {
    subtree: true,
    childList: true,
  });
  return mo;
}
