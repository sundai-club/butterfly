// content.js - Injects AI comment UI under LinkedIn posts

function injectButterflyUI(postElement) {
  if (postElement.querySelector('.butterfly-container')) return; // Avoid duplicates

  const container = document.createElement('div');
  container.className = 'butterfly-container';
  container.innerHTML = `
    <div class="butterfly-suggestion">
      <textarea class="butterfly-textarea" placeholder="AI-generated comment will appear here..."></textarea>
      <button class="butterfly-generate">Suggest Comment</button>
      <button class="butterfly-post">Post</button>
    </div>
  `;
  postElement.appendChild(container);

  const generateBtn = container.querySelector('.butterfly-generate');
  const textarea = container.querySelector('.butterfly-textarea');
  const postBtn = container.querySelector('.butterfly-post');
  generateBtn.onclick = async () => {
    textarea.value = 'Generating...';
    const { postText, postAuthor } = extractPostInfo(postElement);
    const suggestion = await getGeminiSuggestion(postText, postAuthor);
    textarea.value = suggestion || 'Failed to generate comment.';
  };

  // Implement .butterfly-post click to auto-fill LinkedIn's comment box
  postBtn.onclick = () => {
    // Try to find the LinkedIn comment input box within this post
    // LinkedIn comment input selectors may change, but common ones:
    //   - .comments-comment-box__editor
    //   - .ql-editor (inside comments)
    //   - textarea[aria-label="Add a comment…"]
    let commentBox = postElement.querySelector('.comments-comment-box__editor')
      || postElement.querySelector('.ql-editor[contenteditable="true"]')
      || postElement.querySelector('textarea[aria-label="Add a comment…"]');
    if (!commentBox) {
      // Try to click 'Comment' button to open the comment box
      const openCommentBtn = postElement.querySelector('button[aria-label*="Comment"]');
      if (openCommentBtn) {
        openCommentBtn.click();
        // Try to find the box again after a short delay
        setTimeout(() => {
          let cb = postElement.querySelector('.comments-comment-box__editor')
            || postElement.querySelector('.ql-editor[contenteditable="true"]')
            || postElement.querySelector('textarea[aria-label="Add a comment…"]');
          if (cb) {
            fillLinkedInCommentBox(cb, textarea.value);
          } else {
            alert('Could not find LinkedIn comment box.');
          }
        }, 500);
        return;
      }
      alert('Could not find LinkedIn comment box.');
      return;
    }
    fillLinkedInCommentBox(commentBox, textarea.value);
  };

  // Helper function to fill comment box
  function fillLinkedInCommentBox(box, text) {
    if (box.tagName === 'TEXTAREA') {
      box.value = text;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.focus();
    } else if (box.isContentEditable) {
      box.innerText = text;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.focus();
    }
  }
}

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

// Update getGeminiSuggestion to accept both postText and postAuthor
async function getGeminiSuggestion(postText, postAuthor) {
  console.log('Gemini suggestion request:', { postText, postAuthor });
  // Send message to background for Gemini API call
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', postText, postAuthor }, (response) => {
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

// Debounce utility (per instance)
function debounce(func, wait) {
  const timeouts = new WeakMap();
  return function debounced(node, ...args) {
    if (timeouts.has(node)) {
      clearTimeout(timeouts.get(node));
    }
    timeouts.set(node, setTimeout(() => {
      func.call(this, node, ...args);
      timeouts.delete(node);
    }, wait));
  };
}

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

    // Add Re-generate button if not present
    if (!box.parentElement.querySelector('.butterfly-regenerate-btn')) {
      const btn = document.createElement('button');
      btn.textContent = 'Regenerate';
      btn.className = 'butterfly-regenerate-btn';
      btn.style.marginLeft = '8px';
      btn.style.marginTop = '4px';
      btn.style.padding = '2px 8px';
      btn.style.fontSize = '12px';
      btn.style.cursor = 'pointer';
      btn.style.background = '#8A2BE2';
      btn.style.color = 'white';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Generating...';
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
        btn.disabled = false;
        btn.textContent = 'Regenerate';
      };
      // Insert after the comment box
      if (box.nextSibling) {
        box.parentElement.insertBefore(btn, box.nextSibling);
      } else {
        box.parentElement.appendChild(btn);
      }
    }
  }

  async function scanAndFill() {
    // Debounced fill per comment box
    if (!window._butterflyDebouncedFill) {
      window._butterflyDebouncedFill = new WeakMap();
    }
    for (const sel of COMMENT_SELECTORS) {
      const boxes = document.querySelectorAll(sel);
      for (const box of boxes) {
        let debounced = window._butterflyDebouncedFill.get(box);
        if (!debounced) {
          debounced = debounce(fillCommentBox, 100).bind(this, box);
          window._butterflyDebouncedFill.set(box, debounced);
        }
        debounced();
      }
    }
  }

  // Observe DOM changes for new comment boxes
  const observer = new MutationObserver(scanAndFill);
  observer.observe(document.body, { childList: true, subtree: true });
  // Initial fill
  scanAndFill();
})();
