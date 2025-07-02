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
    commentBox.innerHTML = '';
    const textNode = document.createTextNode(value);
    commentBox.appendChild(textNode);
    
    // Focus first to ensure the element is ready for cursor positioning
    commentBox.focus();
    
    try {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) sel.removeAllRanges();
      
      // Only proceed if the element is in the document and has content
      if (commentBox.isConnected && commentBox.firstChild && commentBox.firstChild.textContent) {
        const range = document.createRange();
        range.setStart(commentBox.firstChild, commentBox.firstChild.textContent.length);
        range.collapse(true);
        sel.addRange(range);
      }
    } catch (e) {
      console.warn('[Butterfly Twitter] Failed to set cursor position:', e);
      // Fallback: just ensure focus is maintained
      commentBox.focus();
    }
  } else {
    commentBox.value = value;
    commentBox.focus();
  }
  
  commentBox.dispatchEvent(new Event('input', { bubbles: true }));
  commentBox.dispatchEvent(new Event('change', { bubbles: true }));
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
      chrome.runtime.sendMessage(
        { type: 'GEMINI_SUGGEST', site: 'twitter', postText, postAuthor, refinement, currentComment },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Butterfly Twitter] Extension context error:', chrome.runtime.lastError);
            resolve('Extension was updated. Please refresh the page to continue using Butterfly.');
            return;
          }
          resolve(response && response.suggestion);
        }
      );
    } catch (error) {
      console.error('[Butterfly Twitter] Failed to send message:', error);
      resolve('Extension was updated. Please refresh the page to continue using Butterfly.');
    }
  });
}

async function performInitialAutoSuggestion(commentBox, tweetElement, suggestBtn) {
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
    const suggestion = await getGeminiSuggestionForTwitter(postText, postAuthor);

    if (suggestion && !suggestion.includes('Extension was updated')) {
      setCommentBoxValue(commentBox, suggestion);
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

function addInteractionButtons(commentBox, tweetElement, suggestBtnInstance) {
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
    const newSuggestion = await getGeminiSuggestionForTwitter(postText, postAuthor, instructions, currentComment);
    if (newSuggestion && !newSuggestion.includes('Extension was updated')) {
      setCommentBoxValue(commentBox, newSuggestion);
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
    const suggestion = await getGeminiSuggestionForTwitter(postText, postAuthor);
    if (suggestion && !suggestion.includes('Extension was updated')) {
      setCommentBoxValue(commentBox, suggestion);
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
      if (!commentBoxes.includes(box)) {
        commentBoxes.push(box);
      }
    });
  }
  
  return commentBoxes;
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
      console.log('[Butterfly Twitter] Found comment box:', commentBox);
      injectUI(commentBox, tweetElement);
      commentBox.dataset.butterflyTwitterInjected = 'true';
    }
  });
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