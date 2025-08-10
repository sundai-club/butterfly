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
function extractPostInfo(postElement, commentBox) {
  // Check if this is a reply to a comment
  if (commentBox) {
    // Check if this is a reply box
    const replyBox = commentBox.closest('.comments-comment-box--reply');
    if (replyBox) {
      // Find the parent comment article that contains this reply box
      const parentArticle = replyBox.closest('article.comments-comment-entity');
      
      if (parentArticle) {
        // Extract parent comment text - look for the main content span
        const commentTextElem = parentArticle.querySelector('.comments-comment-item__main-content');
        
        // Extract parent comment author - look in the meta description
        const commentAuthorElem = parentArticle.querySelector('.comments-comment-meta__description-title');
        
        if (commentTextElem || commentAuthorElem) {
          const postText = commentTextElem ? commentTextElem.innerText.trim() : '';
          const postAuthor = commentAuthorElem ? commentAuthorElem.innerText.trim() : '';
          console.log('[Butterfly] Replying to comment - Author:', postAuthor, 'Text:', postText);
          return { postText, postAuthor };
        }
      }
    }
  }
  
  // Fallback to main post extraction
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
          resolve({ error: 'Extension was updated. Please refresh the page to continue using Butterfly.' });
          return;
        }
        // Handle both single suggestion (backward compatibility) and multiple suggestions
        if (response && response.suggestions) {
          resolve({ suggestions: response.suggestions });
        } else if (response && response.suggestion) {
          resolve({ suggestion: response.suggestion });
        } else {
          resolve({ error: 'No suggestion received' });
        }
      });
    } catch (error) {
      console.error('[Butterfly] Failed to send message:', error);
      resolve({ error: 'Extension was updated. Please refresh the page to continue using Butterfly.' });
    }
  });
}

function scanAndInject() {
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log('[Butterfly LinkedIn] Extension context invalidated, stopping scan');
    return;
  }
  
  // Check if LinkedIn is enabled
  try {
    chrome.storage.sync.get(['enabledPlatforms'], (result) => {
      // Check for chrome.runtime.lastError which indicates context issues
      if (chrome.runtime.lastError) {
        console.log('[Butterfly LinkedIn] Chrome runtime error:', chrome.runtime.lastError);
        return;
      }
      
      const enabledPlatforms = result.enabledPlatforms || {
        linkedin: true,
        twitter: false,
        producthunt: true
      };
      
      // Only proceed if LinkedIn is enabled
      if (!enabledPlatforms.linkedin) {
        console.log('[Butterfly LinkedIn] Extension is disabled for LinkedIn');
        return;
      }
      
      const posts = document.querySelectorAll('[data-urn], .feed-shared-update-v2');
      // posts.forEach(injectButterflyUI);
    });
  } catch (error) {
    console.log('[Butterfly LinkedIn] Error accessing storage:', error);
  }
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
const scanInterval = setInterval(() => {
  // Stop scanning if extension context is invalidated
  if (!isExtensionContextValid()) {
    clearInterval(scanInterval);
    console.log('[Butterfly LinkedIn] Stopping periodic scan due to context invalidation');
    return;
  }
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
      
      const { postText, postAuthor } = extractPostInfo(postElement, box);
      const result = await getGeminiSuggestion(postText, postAuthor);
      
      if (result.suggestions && result.suggestions.length > 0) {
        // Use the first suggestion as the default
        setCommentBoxValue(box, result.suggestions[0]);
        console.log('[Butterfly] Auto-suggestion applied.');
        addInteractionButtons(box, postElement, suggestBtn, result.suggestions);
        addVariantsDropdown(box, result.suggestions, 0);
      } else if (result.suggestion && !result.suggestion.includes('Extension was updated')) {
        setCommentBoxValue(box, result.suggestion);
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

  function addVariantsDropdown(box, suggestions, currentIndex = 0) {
    // Remove existing dropdown if any
    const existingDropdown = box.parentElement.querySelector('.butterfly-variants-container');
    if (existingDropdown) {
      existingDropdown.remove();
    }
    
    if (!suggestions || suggestions.length <= 1) return;
    
    // Create variants container
    const variantsContainer = document.createElement('div');
    variantsContainer.className = 'butterfly-variants-container';
    variantsContainer.style.cssText = 'position: relative; display: inline-block;';
    
    // Create variants button
    const variantsBtn = document.createElement('button');
    variantsBtn.className = 'butterfly-variants-btn butterfly-btn';
    variantsBtn.textContent = 'All variants ▼';
    variantsBtn.style.cssText = 'background-color: #6B46C1; color: white; padding: 6px 12px; border: 1px solid #553C9A; border-radius: 5px; cursor: pointer; font-size: 0.85em; font-weight: 500; margin-left: 5px; margin-top: 5px;';
    
    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'butterfly-variants-dropdown';
    dropdown.style.cssText = 'display: none; position: absolute; bottom: 100%; left: 0; background: white; border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-bottom: 4px; min-width: 300px; max-width: 400px; z-index: 1000;';
    
    // Add each variant to dropdown
    suggestions.forEach((suggestion, index) => {
      const option = document.createElement('div');
      option.className = 'butterfly-variant-option';
      option.style.cssText = 'padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #e1e4e8; font-size: 0.85em; line-height: 1.4;';
      if (index === currentIndex) {
        option.style.backgroundColor = '#f3f6fb';
        option.style.fontWeight = '500';
      }
      
      // Truncate long suggestions for preview
      const displayText = suggestion.length > 100 ? suggestion.substring(0, 100) + '...' : suggestion;
      option.textContent = `${index + 1}. ${displayText}`;
      
      // Add full comment as title attribute for hover tooltip
      option.title = suggestion;
      
      option.onmouseover = () => {
        if (index !== currentIndex) {
          option.style.backgroundColor = '#f8f9fa';
        }
      };
      
      option.onmouseout = () => {
        if (index !== currentIndex) {
          option.style.backgroundColor = 'white';
        }
      };
      
      option.onclick = () => {
        setCommentBoxValue(box, suggestion);
        dropdown.style.display = 'none';
        // Update current selection styling
        dropdown.querySelectorAll('.butterfly-variant-option').forEach((opt, i) => {
          opt.style.backgroundColor = i === index ? '#f3f6fb' : 'white';
          opt.style.fontWeight = i === index ? '500' : 'normal';
        });
      };
      
      dropdown.appendChild(option);
    });
    
    // Toggle dropdown on button click
    variantsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    };
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!variantsContainer.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
    
    variantsContainer.appendChild(variantsBtn);
    variantsContainer.appendChild(dropdown);
    
    // Insert after the Refine button or after the comment box
    const refineBtn = box.parentElement.querySelector('.butterfly-refine-btn');
    if (refineBtn) {
      refineBtn.parentElement.insertBefore(variantsContainer, refineBtn.nextSibling);
    } else {
      const uiContainer = box.parentElement.querySelector('.butterfly-ui-container');
      if (uiContainer) {
        uiContainer.appendChild(variantsContainer);
      }
    }
  }
  
  function addInteractionButtons(box, postElement, suggestBtnInstance, suggestions = null) {
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
      const { postText, postAuthor } = extractPostInfo(postElement, box);
      const result = await getGeminiSuggestion(postText, postAuthor, instructions, currentComment);
      if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0]);
        addVariantsDropdown(box, result.suggestions, 0);
      } else if (result.suggestion && !result.suggestion.includes('Extension was updated')) {
        setCommentBoxValue(box, result.suggestion);
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
      const { postText, postAuthor } = extractPostInfo(postElement, box);
      const result = await getGeminiSuggestion(postText, postAuthor);
      if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0]);
        addInteractionButtons(box, postElement, suggestBtn, result.suggestions);
        addVariantsDropdown(box, result.suggestions, 0);
      } else if (result.suggestion && !result.suggestion.includes('Extension was updated')) {
        setCommentBoxValue(box, result.suggestion);
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