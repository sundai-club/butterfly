// twitter_content.js - Injects AI comment UI for Twitter/X

console.log('[Butterfly] Twitter/X content script loaded');

function injectTwitterButtonStyles() {
  const styleId = 'butterfly-twitter-styles';
  if (document.getElementById(styleId)) return;

  const css = `
    .butterfly-ui-container {
        display: flex;
        align-items: center;
        margin-top: 5px;
        flex-wrap: wrap;
    }
    .butterfly-btn {
      background-color: SlateBlue;
      color: white;
      padding: 6px 12px;
      border: 1px solid #40528A;
      border-radius: 5px;
      margin-left: 5px;
      margin-top: 5px; 
      cursor: pointer;
      font-size: 0.85em;
      font-weight: 500;
      transition: background-color 0.2s ease, box-shadow 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .butterfly-btn:hover {
      background-color: #5A6AAD;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .butterfly-btn:disabled {
      background-color: #9FA8DA;
      color: #E8EAF6;
      cursor: not-allowed;
      box-shadow: none;
    }
  `;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
  console.log('[Butterfly Twitter] Custom button styles injected.');
}

injectTwitterButtonStyles();

function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    return false;
  }
}

function setCommentBoxValue(commentBox, value) {
  if (commentBox.isContentEditable) {
    // Focus first to activate the field
    commentBox.focus();
    
    // Clear existing content
    commentBox.textContent = '';
    
    // Try using execCommand which sometimes works better with contenteditable
    document.execCommand('insertText', false, value);
    
    // If that didn't work, set textContent directly
    if (!commentBox.textContent || commentBox.textContent.trim() === '') {
      commentBox.textContent = value;
    }
    
    // Trigger input event to notify React
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
    });
    commentBox.dispatchEvent(inputEvent);
    
    // Set cursor position at the end
    const selection = window.getSelection();
    const range = document.createRange();
    
    if (commentBox.childNodes.length > 0) {
      const lastNode = commentBox.childNodes[commentBox.childNodes.length - 1];
      if (lastNode.nodeType === Node.TEXT_NODE) {
        range.setStart(lastNode, lastNode.length);
        range.setEnd(lastNode, lastNode.length);
      } else {
        range.selectNodeContents(commentBox);
        range.collapse(false);
      }
    } else {
      range.selectNodeContents(commentBox);
      range.collapse(false);
    }
    
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Dispatch change event
    commentBox.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    commentBox.value = value;
    commentBox.focus();
    commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    commentBox.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function extractTweetInfo(tweetElement) {
  let tweetText = '';
  let tweetAuthor = '';
  
  // Twitter/X tweet text selectors
  const tweetTextElem = tweetElement.querySelector('[data-testid="tweetText"]') || 
                       tweetElement.querySelector('[lang] span') ||
                       tweetElement.querySelector('div[dir="auto"] span');
  
  if (tweetTextElem) {
    tweetText = tweetTextElem.innerText.trim();
  }
  
  // Twitter/X author selectors
  const authorElem = tweetElement.querySelector('[data-testid="User-Name"] span') ||
                    tweetElement.querySelector('div[data-testid="User-Name"] span') ||
                    tweetElement.querySelector('a[role="link"] span');
  
  if (authorElem) {
    tweetAuthor = authorElem.innerText.trim();
  }
  
  console.log('[Butterfly Twitter] Extracted Info:', { tweetText, tweetAuthor });
  return { postText: tweetText, postAuthor: tweetAuthor };
}

async function getGeminiSuggestionForTwitter(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('[Butterfly Twitter] Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });
  return new Promise((resolve) => {
    try {
      // Check if chrome.runtime is available
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        console.error('[Butterfly Twitter] Extension context not available');
        resolve({ error: 'Extension context not available. Please refresh the page.' });
        return;
      }
      
      chrome.runtime.sendMessage(
        { type: 'GEMINI_SUGGEST', site: 'twitter', postText, postAuthor, refinement, currentComment },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Butterfly Twitter] Extension context error:', chrome.runtime.lastError);
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
        }
      );
    } catch (error) {
      console.error('[Butterfly Twitter] Failed to send message:', error);
      resolve({ error: 'Extension was updated. Please refresh the page to continue using Butterfly.' });
    }
  });
}

async function performInitialAutoSuggestion(commentBox, tweetElement, suggestBtn) {
  // Skip auto-suggestion if extension context is not valid
  if (!isExtensionContextValid()) {
    console.log('[Butterfly Twitter] Extension context not valid, skipping auto-suggestion.');
    return;
  }
  
  const isEmpty = (commentBox.isContentEditable && commentBox.innerText.trim() === '') ||
                 (!commentBox.isContentEditable && commentBox.value.trim() === '');

  if (isEmpty && !commentBox.dataset.butterflyAutoSuggested) {
    console.log('[Butterfly Twitter] Comment box is empty, attempting auto-suggestion.');
    commentBox.dataset.butterflyAutoSuggested = 'true';

    const originalText = suggestBtn.textContent;
    suggestBtn.disabled = true;
    suggestBtn.textContent = 'Auto-suggesting...';

    const uiContainer = suggestBtn.parentElement;
    uiContainer.querySelectorAll('.butterfly-twitter-refine-btn').forEach(btn => btn.style.display = 'none');

    const { postText, postAuthor } = extractTweetInfo(tweetElement);
    const result = await getGeminiSuggestionForTwitter(postText, postAuthor);

    if (result.suggestions && result.suggestions.length > 0) {
      setCommentBoxValue(commentBox, result.suggestions[0]);
      console.log('[Butterfly Twitter] Auto-suggestion applied.');
      addInteractionButtons(commentBox, tweetElement, suggestBtn, result.suggestions);
      addVariantsDropdown(commentBox, result.suggestions, 0);
    } else if (result.suggestion && !result.suggestion.includes('Extension was updated')) {
      setCommentBoxValue(commentBox, result.suggestion);
      console.log('[Butterfly Twitter] Auto-suggestion applied.');
      addInteractionButtons(commentBox, tweetElement, suggestBtn);
    } else {
      console.log('[Butterfly Twitter] Auto-suggestion failed or returned empty.');
    }

    suggestBtn.disabled = false;
    suggestBtn.textContent = originalText;
    uiContainer.querySelectorAll('.butterfly-twitter-refine-btn').forEach(btn => btn.style.display = '');
  }
}

function addVariantsDropdown(commentBox, suggestions, currentIndex = 0) {
  // Remove existing dropdown if any
  const existingDropdown = commentBox.parentElement.querySelector('.butterfly-variants-container');
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
  dropdown.style.cssText = 'display: none; position: fixed; background: white; border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 300px; max-width: 400px; z-index: 2147483647; max-height: 300px; overflow-y: auto;';
  
  // Add each variant to dropdown
  suggestions.forEach((suggestion, index) => {
    const option = document.createElement('div');
    option.className = 'butterfly-variant-option';
    option.style.cssText = 'padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #e1e4e8; font-size: 0.85em; line-height: 1.4; color: black;';
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
      setCommentBoxValue(commentBox, suggestion);
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
    
    if (dropdown.style.display === 'none') {
      dropdown.style.display = 'block';
      
      // Position dropdown using fixed positioning relative to viewport
      const btnRect = variantsBtn.getBoundingClientRect();
      const dropdownWidth = 350; // Approximate width
      const dropdownHeight = Math.min(300, suggestions.length * 60); // Approximate height
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      // Vertical positioning: prefer above button to avoid overlapping with reply field
      const spaceBelow = viewportHeight - btnRect.bottom;
      const spaceAbove = btnRect.top;
      
      if (spaceAbove >= dropdownHeight + 10) {
        // Show above button (preferred to avoid reply field overlap)
        dropdown.style.bottom = (viewportHeight - btnRect.top + 8) + 'px';
        dropdown.style.top = 'auto';
      } else if (spaceBelow >= dropdownHeight + 10) {
        // Show below button only if not enough space above
        dropdown.style.top = (btnRect.bottom + 4) + 'px';
        dropdown.style.bottom = 'auto';
      } else {
        // Not enough space either way, show above with scrolling
        const availableHeight = Math.min(dropdownHeight, spaceAbove - 20);
        dropdown.style.maxHeight = availableHeight + 'px';
        dropdown.style.bottom = (viewportHeight - btnRect.top + 8) + 'px';
        dropdown.style.top = 'auto';
      }
      
      // Horizontal positioning: align with button but keep in viewport
      let leftPos = btnRect.left;
      
      // Check if dropdown would overflow right edge
      if (leftPos + dropdownWidth > viewportWidth - 10) {
        leftPos = viewportWidth - dropdownWidth - 10;
      }
      
      // Check if dropdown would overflow left edge
      if (leftPos < 10) {
        leftPos = 10;
      }
      
      dropdown.style.left = leftPos + 'px';
      dropdown.style.right = 'auto';
    } else {
      dropdown.style.display = 'none';
    }
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
  const refineBtn = commentBox.parentElement.querySelector('.butterfly-twitter-refine-btn');
  if (refineBtn) {
    refineBtn.parentElement.insertBefore(variantsContainer, refineBtn.nextSibling);
  } else {
    const uiContainer = commentBox.parentElement.querySelector('.butterfly-ui-container');
    if (uiContainer) {
      uiContainer.appendChild(variantsContainer);
    }
  }
}

function addInteractionButtons(commentBox, tweetElement, suggestBtnInstance, suggestions = null) {
  const uiContainer = commentBox.parentElement.querySelector('.butterfly-ui-container[data-commentbox-id="' + commentBox.dataset.butterflyId + '"]');
  if (!uiContainer) {
    console.error("[Butterfly Twitter] UI container not found for interaction buttons.");
    return;
  }

  uiContainer.querySelectorAll('.butterfly-twitter-refine-btn').forEach(btn => btn.remove());

  const refineBtn = document.createElement('button');
  refineBtn.textContent = 'Refine';
  refineBtn.className = 'butterfly-twitter-refine-btn butterfly-btn';
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
    
    if (instructions === null || instructions.trim() === '') {
      refineBtn.disabled = false;
      refineBtn.textContent = 'Refine';
      if (suggestBtnInstance) {
        suggestBtnInstance.disabled = false;
        suggestBtnInstance.textContent = originalSuggestText;
      }
      return;
    }
    
    let currentComment = commentBox.isContentEditable ? commentBox.innerText : commentBox.value;
    const { postText, postAuthor } = extractTweetInfo(tweetElement);
    const result = await getGeminiSuggestionForTwitter(postText, postAuthor, instructions, currentComment);
    if (result.suggestions && result.suggestions.length > 0) {
      setCommentBoxValue(commentBox, result.suggestions[0]);
      addVariantsDropdown(commentBox, result.suggestions, 0);
    } else if (result.suggestion && !result.suggestion.includes('Extension was updated')) {
      setCommentBoxValue(commentBox, result.suggestion);
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

function injectUI(commentBox, tweetElement) {
  let uiContainer = commentBox.parentElement.querySelector('.butterfly-ui-container[data-commentbox-id="' + commentBox.dataset.butterflyId + '"]');
  if (uiContainer) {
    return;
  }

  if (!commentBox.dataset.butterflyId) {
    commentBox.dataset.butterflyId = 'tw-cb-' + Date.now() + Math.random().toString(36).substring(2, 7);
  }

  uiContainer = document.createElement('div');
  uiContainer.className = 'butterfly-ui-container';
  uiContainer.dataset.commentboxId = commentBox.dataset.butterflyId;

  const suggestBtn = document.createElement('button');
  suggestBtn.textContent = 'Suggest Comment ✨';
  suggestBtn.className = 'butterfly-twitter-suggest-btn butterfly-btn';
  uiContainer.appendChild(suggestBtn);

  commentBox.parentElement.insertBefore(uiContainer, commentBox.nextSibling);

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
    const { postText, postAuthor } = extractTweetInfo(tweetElement);
    const result = await getGeminiSuggestionForTwitter(postText, postAuthor);
    if (result.suggestions && result.suggestions.length > 0) {
      setCommentBoxValue(commentBox, result.suggestions[0]);
      addInteractionButtons(commentBox, tweetElement, suggestBtn, result.suggestions);
      addVariantsDropdown(commentBox, result.suggestions, 0);
    } else if (result.suggestion && !result.suggestion.includes('Extension was updated')) {
      setCommentBoxValue(commentBox, result.suggestion);
      addInteractionButtons(commentBox, tweetElement, suggestBtn);
    }
    suggestBtn.disabled = false;
    suggestBtn.textContent = originalText;
  };

  performInitialAutoSuggestion(commentBox, tweetElement, suggestBtn);
}

function findCommentBoxes() {
  // Twitter/X reply/comment box selectors
  const selectors = [
    '[data-testid="tweetTextarea_0"]',
    'div[contenteditable="true"][data-testid="tweetTextarea_0"]',
    '.public-DraftEditor-content[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea[placeholder*="reply"]',
    'div[contenteditable="true"][aria-label*="reply"]'
  ];

  const commentBoxes = [];
  for (const selector of selectors) {
    const boxes = document.querySelectorAll(selector);
    boxes.forEach(box => {
      // Check if this is a reply box, not the main tweet composer
      const isReply = isReplyBox(box);
      if (isReply && !commentBoxes.includes(box)) {
        commentBoxes.push(box);
      }
    });
  }
  
  return commentBoxes;
}

function isReplyBox(box) {
  // Check if the box has a reply-related placeholder
  const placeholder = box.getAttribute('placeholder') || 
                     box.getAttribute('aria-label') || '';
  if (placeholder.toLowerCase().includes('reply')) {
    return true;
  }
  
  // Check if it's inside a reply modal or thread
  const inReplyModal = box.closest('[aria-labelledby="modal-header"]') !== null;
  const inReplyThread = box.closest('[data-testid="reply"]') !== null;
  
  // Check if it's in the conversation/thread view (URL contains /status/)
  const inStatusThread = window.location.pathname.includes('/status/');
  
  // Check if it's NOT the main composer
  // Main composer is usually at the top of the home timeline
  const isMainComposer = box.closest('[data-testid="primaryColumn"] > div > div:first-child') !== null ||
                        box.closest('[data-testid="tweetButtonInline"]') !== null;
  
  // It's a reply box if:
  // 1. It's in a reply modal OR
  // 2. It's in a reply thread OR  
  // 3. It's in a status thread view OR
  // 4. It has reply placeholder AND is not the main composer
  return (inReplyModal || inReplyThread || inStatusThread) && !isMainComposer;
}

function findTweetElement(commentBox) {
  // Find the tweet that this comment box belongs to
  return commentBox.closest('[data-testid="tweet"]') ||
         commentBox.closest('article') ||
         commentBox.closest('div[role="article"]') ||
         document.body; // fallback
}

function scanAndInjectTwitter() {
  const commentBoxes = findCommentBoxes();
  
  commentBoxes.forEach(commentBox => {
    if (!commentBox.dataset.butterflyTwitterInjected) {
      const tweetElement = findTweetElement(commentBox);
      console.log('[Butterfly Twitter] Found reply box:', commentBox);
      injectUI(commentBox, tweetElement);
      commentBox.dataset.butterflyTwitterInjected = 'true';
    }
  });
  
  // Debug: Check if main composer is being correctly excluded
  const mainComposer = document.querySelector('[data-testid="tweetTextarea_0"]');
  if (mainComposer && !isReplyBox(mainComposer)) {
    console.log('[Butterfly Twitter] Main composer excluded (working as intended)');
  }
}

// SPA Navigation handling
let twitterCurrentFeed = null;
let twitterFeedObserver = null;
let twitterLastUrl = location.href;

function twitterObserveFeed() {
  const feed = document.querySelector('main[role="main"]') || document.querySelector('#react-root') || document.body;
  if (feed && feed !== twitterCurrentFeed) {
    if (twitterFeedObserver) twitterFeedObserver.disconnect();
    twitterCurrentFeed = feed;
    twitterFeedObserver = new MutationObserver(scanAndInjectTwitter);
    twitterFeedObserver.observe(feed, { childList: true, subtree: true });
    console.log('[Butterfly Twitter] Observer attached to:', feed);
  }
}

function twitterOnUrlChange() {
  if (location.href !== twitterLastUrl) {
    twitterLastUrl = location.href;
    console.log('[Butterfly Twitter] URL changed to:', twitterLastUrl);
    scanAndInjectTwitter();
    twitterObserveFeed();
  }
}

// Listen for URL changes
window.addEventListener('popstate', twitterOnUrlChange);

// Patch history methods for SPA navigation
(function () {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    window.dispatchEvent(new Event('twitterLocationChange'));
  };
  
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event('twitterLocationChange'));
  };
})();

window.addEventListener('twitterLocationChange', twitterOnUrlChange);

// Initial scan and observer setup
setTimeout(() => {
  scanAndInjectTwitter();
  twitterObserveFeed();
}, 1000);

// Periodic scan fallback
setInterval(() => {
  scanAndInjectTwitter();
}, 3000);

console.log('[Butterfly] Twitter/X content script execution finished.');