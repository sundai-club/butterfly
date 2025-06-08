// content.js - Injects AI comment UI under LinkedIn posts

// Function to check if extension context is still valid
function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    return false;
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

// Update getGeminiSuggestion to accept both postText, postAuthor, refinement, and currentComment
async function getGeminiSuggestion(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });
  // Send message to background for Gemini API call
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', site: 'linkedin', postText, postAuthor, refinement, currentComment }, (response) => {
        // Check for chrome.runtime.lastError which indicates extension context issues
        if (chrome.runtime.lastError) {
          console.error('[Butterfly] Extension context error:', chrome.runtime.lastError);
          resolve('Extension was updated. Please refresh the page to continue using Butterfly.');
          return;
        }
        resolve(response && response.suggestion);
      });
    } catch (error) {
      console.error('[Butterfly] Failed to send message:', error);
      resolve('Extension was updated. Please refresh the page to continue using Butterfly.');
    }
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

  // Helper to find the post element from a comment box
  function findPostElementFromCommentBox(box) {
    // Try to find the closest LinkedIn post container
    return box.closest('.feed-shared-update-v2, .scaffold-finite-scroll__content, .update-components-update, article');
  }

  function setCommentBoxValue(box, value) {
    if (box.isContentEditable) {
      box.innerText = value;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      box.value = value;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function performInitialAutoSuggestion(box, postElement, suggestBtn) {
    const isEmpty = (box.isContentEditable && box.innerText.trim() === '') || 
                   (!box.isContentEditable && box.value.trim() === '');
    
    if (isEmpty && !box.dataset.butterflyAutoSuggested) {
      console.log('[Butterfly] Comment box is empty, attempting auto-suggestion.');
      box.dataset.butterflyAutoSuggested = 'true';
      
      const originalSuggestText = suggestBtn.textContent;
      suggestBtn.disabled = true;
      suggestBtn.textContent = 'Auto-suggesting...';
      
      // Hide refine button if it exists
      const uiContainer = suggestBtn.parentElement;
      uiContainer.querySelectorAll('.butterfly-refine-btn').forEach(btn => btn.style.display = 'none');
      
      const { postText, postAuthor } = extractPostInfo(postElement);
      const suggestion = await getGeminiSuggestion(postText, postAuthor);
      
      if (suggestion && !suggestion.includes('Extension was updated')) {
        setCommentBoxValue(box, suggestion);
        console.log('[Butterfly] Auto-suggestion applied.');
        addInteractionButtons(box, postElement, suggestBtn);
      } else {
        console.log('[Butterfly] Auto-suggestion failed or returned empty.');
      }
      
      suggestBtn.disabled = false;
      suggestBtn.textContent = originalSuggestText;
      uiContainer.querySelectorAll('.butterfly-refine-btn').forEach(btn => btn.style.display = '');
    }
  }

  function addInteractionButtons(box, postElement, suggestBtnInstance) {
    const uiContainer = box.parentElement.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]');
    if (!uiContainer) {
      console.error("[Butterfly] UI container not found for interaction buttons.");
      return;
    }
    
    // Remove existing refine button
    uiContainer.querySelectorAll('.butterfly-refine-btn').forEach(btn => btn.remove());
    
    const refineBtn = document.createElement('button');
    refineBtn.textContent = 'Refine';
    refineBtn.className = 'butterfly-refine-btn butterfly-btn';
    refineBtn.style.cssText = 'background-color: SlateBlue; color: white; padding: 6px 12px; border: 1px solid #40528A; border-radius: 5px; margin-left: 5px; margin-top: 5px; cursor: pointer; font-size: 0.85em; font-weight: 500;';
    refineBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!isExtensionContextValid()) {
        alert('Extension was updated. Please refresh the page to continue using Butterfly.');
        return;
      }
      
      const originalSuggestText = suggestBtnInstance ? suggestBtnInstance.textContent : 'Suggest Comment ✨';
      refineBtn.disabled = true;
      refineBtn.textContent = 'Refining...';
      if (suggestBtnInstance) suggestBtnInstance.disabled = true;
      
      const instructions = prompt('How would you like to refine the reply? (Add extra instructions)', '');
      
      // Early return if user cancels or provides empty input
      if (instructions === null || instructions.trim() === '') {
        refineBtn.disabled = false;
        refineBtn.textContent = 'Refine';
        if (suggestBtnInstance) {
          suggestBtnInstance.disabled = false;
          suggestBtnInstance.textContent = originalSuggestText;
        }
        return;
      }
      
      // Get the current value of the comment box
      let currentComment = box.isContentEditable ? box.innerText : box.value;
      const { postText, postAuthor } = extractPostInfo(postElement);
      const newSuggestion = await getGeminiSuggestion(postText, postAuthor, instructions, currentComment);
      if (newSuggestion && !newSuggestion.includes('Extension was updated')) {
        setCommentBoxValue(box, newSuggestion);
      }
      
      refineBtn.disabled = false;
      refineBtn.textContent = 'Refine';
      if (suggestBtnInstance) {
        suggestBtnInstance.disabled = false;
        suggestBtnInstance.textContent = originalSuggestText;
      }
    };
    uiContainer.appendChild(refineBtn);
  }

  function injectUI(box, postElement) {
    // Check if UI already exists
    let uiContainer = box.parentElement.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]');
    if (uiContainer) {
      return;
    }
    
    // Assign unique ID to comment box
    if (!box.dataset.butterflyId) {
      box.dataset.butterflyId = 'li-cb-' + Date.now() + Math.random().toString(36).substring(2, 7);
    }
    
    // Create UI container
    uiContainer = document.createElement('div');
    uiContainer.className = 'butterfly-ui-container';
    uiContainer.dataset.commentboxId = box.dataset.butterflyId;
    uiContainer.style.cssText = 'display: flex; align-items: center; margin-top: 5px; flex-wrap: wrap;';
    
    // Create suggest button
    const suggestBtn = document.createElement('button');
    suggestBtn.textContent = 'Suggest Comment ✨';
    suggestBtn.className = 'butterfly-suggest-btn butterfly-btn';
    suggestBtn.style.cssText = 'background-color: SlateBlue; color: white; padding: 6px 12px; border: 1px solid #40528A; border-radius: 5px; margin-left: 5px; margin-top: 5px; cursor: pointer; font-size: 0.85em; font-weight: 500;';
    uiContainer.appendChild(suggestBtn);
    
    // Insert container after comment box
    box.parentElement.insertBefore(uiContainer, box.nextSibling);
    
    // Add click handler
    suggestBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!isExtensionContextValid()) {
        alert('Extension was updated. Please refresh the page to continue using Butterfly.');
        return;
      }
      
      const originalText = suggestBtn.textContent;
      suggestBtn.disabled = true;
      suggestBtn.textContent = 'Thinking...';
      const { postText, postAuthor } = extractPostInfo(postElement);
      const suggestion = await getGeminiSuggestion(postText, postAuthor);
      if (suggestion && !suggestion.includes('Extension was updated')) {
        setCommentBoxValue(box, suggestion);
        addInteractionButtons(box, postElement, suggestBtn);
      }
      suggestBtn.disabled = false;
      suggestBtn.textContent = originalText;
    };
    
    // Attempt initial auto-suggestion
    performInitialAutoSuggestion(box, postElement, suggestBtn);
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
          const postElement = findPostElementFromCommentBox(box);
          if (postElement && !box.dataset.butterflyInjected) {
            injectUI(box, postElement);
            box.dataset.butterflyInjected = 'true';
          }
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