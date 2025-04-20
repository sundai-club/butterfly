// content.js - Injects AI comment UI under LinkedIn posts

// New function to extract both post text and author
function extractPostInfo(postElement) {
  // Try to extract the main post text
  const mainTextElem = postElement.querySelector('[data-ad-preview="message"]') || postElement.querySelector('.feed-shared-update-v2__description');
  const postText = mainTextElem ? mainTextElem.innerText.trim() : '';

  // Try multiple selectors for author name
  let authorElem = postElement.querySelector('.feed-shared-actor__name')
    || postElement.querySelector('.update-components-actor__name')
    || postElement.querySelector('.feed-shared-actor__meta a')
    || postElement.querySelector('.update-components-actor__meta a');

  // Fallback: try first anchor or span in likely header containers
  if (!authorElem) {
    const header = postElement.querySelector('.feed-shared-actor, .update-components-actor');
    if (header) {
      authorElem = header.querySelector('a, span');
    }
  }

  // Debug: log all possible candidates
  // const candidates = postElement.querySelectorAll('.feed-shared-actor__name, .update-components-actor__name, .feed-shared-actor__meta a, .update-components-actor__meta a, .feed-shared-actor a, .update-components-actor a, a, span');
  // console.log('[Butterfly] Author candidates:', candidates);
  const postAuthor = authorElem ? authorElem.innerText.trim() : '';
  console.log('[Butterfly] Selected author:', postAuthor);
  return { postText, postAuthor };
}

// Update getGeminiSuggestion to accept both postText, postAuthor, refinement, and currentComment
async function getGeminiSuggestion(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });
  // Send message to background for Gemini API call
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', postText, postAuthor, refinement, currentComment }, (response) => {
      resolve(response && response.suggestion);
    });
  });
}

function scanAndInject() {
  const posts = document.querySelectorAll('[data-urn], .feed-shared-update-v2');
  // posts.forEach(injectButterflyUI);
}

// --- SPA Navigation & Robust Observer Fix ---
let currentFeed = null;
let feedObserver = null;
let lastUrl = location.href;

function observeFeed() {
  const feed = document.querySelector('main');
  if (feed !== currentFeed) {
    if (feedObserver) feedObserver.disconnect();
    currentFeed = feed;
    if (feed) {
      feedObserver = new MutationObserver(scanAndInject);
      feedObserver.observe(feed, { childList: true, subtree: true });
    }
  }
}

function onUrlChange() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scanAndInject();
    observeFeed();
  }
}

// Patch history methods to detect pushState/replaceState
(function () {
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
  };
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
  };
})();
window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
window.addEventListener('locationchange', onUrlChange);

// Initial scan and observer setup
scanAndInject();
observeFeed();
// Fallback: periodic scan in case observer misses something
setInterval(() => {
  scanAndInject();
  observeFeed();
}, 2000);
// --- End SPA Fix ---

// --- Per-comment throttle (leading edge, 1s block) ---
const butterflyLastFillTime = new WeakMap();

// --- Auto-fill LinkedIn comment fields as soon as they appear ---
(function autoFillLinkedInComments() {
  const COMMENT_SELECTORS = [
    '.comments-comment-box__editor',
    '.ql-editor[contenteditable="true"]',
    'textarea[aria-label="Add a comment…"]',
    'textarea[aria-label="Add a comment..."]',
    'textarea[name="comment"]',
  ];
  const FILLED_ATTR = 'data-butterfly-filled';

  // Helper to find the post element from a comment box
  function findPostElementFromCommentBox(box) {
    // Try to find the closest LinkedIn post container
    return box.closest('.feed-shared-update-v2, .scaffold-finite-scroll__content, .update-components-update, article');
  }

  async function fillCommentBox(box) {
    if (box.getAttribute(FILLED_ATTR)) return;
    const postElement = findPostElementFromCommentBox(box);
    if (!postElement) return;
    const { postText, postAuthor } = extractPostInfo(postElement);
    const suggestion = await getGeminiSuggestion(postText, postAuthor);
    if (!suggestion) return;
    // For contenteditable (divs)
    if (box.isContentEditable) {
      box.innerText = suggestion;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      box.value = suggestion;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
    box.setAttribute(FILLED_ATTR, '1');

    // Add Re-generate and Refine buttons if not present
    if (!box.parentElement.querySelector('.butterfly-regenerate-btn')) {
      const regenerateBtn = document.createElement('button');
      regenerateBtn.textContent = 'Regenerate';
      regenerateBtn.className = 'butterfly-regenerate-btn';
      regenerateBtn.style.marginLeft = '8px';
      regenerateBtn.style.marginTop = '4px';
      regenerateBtn.style.padding = '2px 8px';
      regenerateBtn.style.fontSize = '12px';
      regenerateBtn.style.cursor = 'pointer';
      regenerateBtn.style.background = '#8A2BE2';
      regenerateBtn.style.color = 'white';
      regenerateBtn.style.border = 'none';
      regenerateBtn.style.borderRadius = '4px';
      regenerateBtn.onclick = async () => {
        regenerateBtn.disabled = true;
        regenerateBtn.textContent = 'Generating...';
        const { postText, postAuthor } = extractPostInfo(postElement);
        const newSuggestion = await getGeminiSuggestion(postText, postAuthor);
        if (newSuggestion) {
          if (box.isContentEditable) {
            box.innerText = newSuggestion;
            box.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            box.value = newSuggestion;
            box.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        regenerateBtn.disabled = false;
        regenerateBtn.textContent = 'Regenerate';
      };
      // Refine button
      const refineBtn = document.createElement('button');
      refineBtn.textContent = 'Refine';
      refineBtn.className = 'butterfly-refine-btn';
      refineBtn.style.marginLeft = '8px';
      refineBtn.style.marginTop = '4px';
      refineBtn.style.padding = '2px 8px';
      refineBtn.style.fontSize = '12px';
      refineBtn.style.cursor = 'pointer';
      refineBtn.style.background = '#4B0082';
      refineBtn.style.color = 'white';
      refineBtn.style.border = 'none';
      refineBtn.style.borderRadius = '4px';
      refineBtn.onclick = async () => {
        refineBtn.disabled = true;
        refineBtn.textContent = 'Refining...';
        const instructions = prompt('How would you like to refine the reply? (Add extra instructions) DANGER BUG: DO NOT LEAVE EMPTY AND DO NOT CANCEL', 'refine');
        if (instructions) {
          // Get the current value of the comment box
          let currentComment = box.isContentEditable ? box.innerText : box.value;
          const { postText, postAuthor } = extractPostInfo(postElement);
          // Pass instructions and currentComment as separate arguments
          const newSuggestion = await getGeminiSuggestion(postText, postAuthor, instructions, currentComment);
          if (newSuggestion) {
            if (box.isContentEditable) {
              box.innerText = newSuggestion;
              box.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              box.value = newSuggestion;
              box.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        }
        refineBtn.disabled = false;
        refineBtn.textContent = 'Refine';
      };
      // Fake button
      const fakeBtn = document.createElement('button');
      fakeBtn.textContent = 'Post';
      fakeBtn.className = 'butterfly-fake-btn';
      fakeBtn.style.marginLeft = '8px';
      fakeBtn.style.marginTop = '4px';
      fakeBtn.style.padding = '2px 8px';
      fakeBtn.style.fontSize = '12px';
      fakeBtn.style.cursor = 'pointer';
      fakeBtn.style.background = '#FF6347';
      fakeBtn.style.color = 'white';
      fakeBtn.style.border = 'none';
      fakeBtn.style.borderRadius = '4px';
      fakeBtn.onclick = () => {
        box.dispatchEvent(new Event('input', { bubbles: true }));
      };
      // Insert after the comment box
      if (box.nextSibling) {
        box.parentElement.insertBefore(regenerateBtn, box.nextSibling);
        box.parentElement.insertBefore(refineBtn, regenerateBtn.nextSibling);
        box.parentElement.insertBefore(fakeBtn, refineBtn.nextSibling);
      } else {
        box.parentElement.appendChild(regenerateBtn);
        box.parentElement.appendChild(refineBtn);
        box.parentElement.appendChild(fakeBtn);
      }
    }
  }

  async function scanAndFill() {
    // Leading-edge throttle per comment box (1s)
    for (const sel of COMMENT_SELECTORS) {
      const boxes = document.querySelectorAll(sel);
      for (const box of boxes) {
        const now = Date.now();
        const last = butterflyLastFillTime.get(box) || 0;
        if (now - last >= 1000) {
          butterflyLastFillTime.set(box, now);
          fillCommentBox(box);
        }
      }
    }
  }

  // Observe DOM changes for new comment boxes
  const observer = new MutationObserver(scanAndFill);
  observer.observe(document.body, { childList: true, subtree: true });
  // Initial fill
  scanAndFill();
})();
