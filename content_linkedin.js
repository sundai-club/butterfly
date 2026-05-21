// content.js - Injects AI comment UI under LinkedIn posts

// Function to check if extension context is still valid
function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    console.log('[Butterfly LinkedIn] Extension context invalidated - page reload required');
    return false;
  }
}

// Show message when context is invalidated
function showContextInvalidatedMessage() {
  const existingMessage = document.querySelector('.butterfly-reload-message');
  if (existingMessage) return;
  
  const message = document.createElement('div');
  message.className = 'butterfly-reload-message';
  message.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff6b6b;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  message.textContent = '🦋 Butterfly extension updated. Please refresh the page to continue.';
  document.body.appendChild(message);
  
  setTimeout(() => message.remove(), 10000);
}

function showInlineStatus(uiContainer, message) {
  if (!uiContainer) return;
  const existing = uiContainer.querySelector('.butterfly-inline-status');
  if (existing) existing.remove();
  
  const status = document.createElement('span');
  status.className = 'butterfly-inline-status';
  status.textContent = `${message}?`;
  status.title = 'Enable LinkedIn in Butterfly settings: click the 🦋 icon, check "LinkedIn", then try again.';
  status.style.cssText = 'margin-left: 8px; font-size: 12px; color: #6b7280; text-decoration: underline dotted; cursor: help;';
  uiContainer.appendChild(status);
}

let linkedinEnabled = true;

function removeLinkedInUI() {
  document.querySelectorAll('.butterfly-ui-container, .butterfly-variants-container, .butterfly-inline-status').forEach(element => {
    element.remove();
  });
  document.querySelectorAll('[data-butterfly-injected]').forEach(element => {
    delete element.dataset.butterflyInjected;
  });
  document.querySelectorAll('[data-butterfly-auto-suggested]').forEach(element => {
    delete element.dataset.butterflyAutoSuggested;
  });
}

function refreshLinkedInEnabled() {
  if (!isExtensionContextValid()) {
    linkedinEnabled = false;
    return;
  }
  chrome.storage.sync.get(['enabledPlatforms'], (result) => {
    if (chrome.runtime.lastError) {
      if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('context invalidated')) {
        showContextInvalidatedMessage();
      }
      return;
    }
    const enabledPlatforms = result.enabledPlatforms || {
      linkedin: true,
      twitter: false,
      producthunt: true,
      reddit: true
    };
    linkedinEnabled = enabledPlatforms.linkedin !== false;
    if (!linkedinEnabled) {
      removeLinkedInUI();
    }
  });
}

function cleanLinkedInText(value) {
  return (value || '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function getElementText(element) {
  return element ? cleanLinkedInText(element.innerText || element.textContent || '') : '';
}

function findFirstWithText(root, selectors) {
  if (!root) return null;
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (getElementText(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

const LINKEDIN_POST_CONTAINER_SELECTOR = [
  '.feed-shared-update-v2',
  '.update-components-update',
  '.occludable-update',
  '[data-urn^="urn:li:activity"]',
  '[data-id^="urn:li:activity"]',
  '[componentkey*="FeedType_"]',
  '[role="listitem"]'
].join(', ');

const LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR = [
  '[aria-label^="Open control menu for post by "]',
  '[aria-label^="Hide post by "]'
].join(', ');

function normalizeLinkedInAuthorName(value) {
  let text = cleanLinkedInText(value).replace(/\u00a0/g, ' ');
  if (!text) return '';

  const firstLine = text.split('\n').map(part => part.trim()).find(Boolean) || '';
  text = firstLine
    .replace(/^Open control menu for post by\s+/i, '')
    .replace(/^Hide post by\s+/i, '')
    .replace(/^View\s+/i, '')
    .replace(/(?:'|’)?s\s+profile$/i, '')
    .replace(/\s*•.*$/, '')
    .replace(/\s+\b(?:1st|2nd|3rd)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.length > 80) return '';
  if (/https?:\/\//i.test(text)) return '';
  if (/\b(comment|repost|send|reaction|visibility|feed post|view image)\b/i.test(text)) return '';
  if (text.split(/\s+/).length > 8) return '';

  return text;
}

function getElementAuthorName(element) {
  if (!element) return '';
  const values = [
    element.getAttribute && element.getAttribute('aria-label'),
    element.getAttribute && element.getAttribute('alt'),
    element.getAttribute && element.getAttribute('title'),
    getElementText(element)
  ];

  for (const value of values) {
    const authorName = normalizeLinkedInAuthorName(value || '');
    if (authorName) return authorName;
  }
  return '';
}

function findFirstAuthorName(root, selectors) {
  if (!root) return '';
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const candidate of candidates) {
      const authorName = getElementAuthorName(candidate);
      if (authorName) return authorName;
    }
  }
  return '';
}

function hasLinkedInPostSignals(element) {
  if (!element || !element.querySelector) return false;
  return Boolean(
    element.querySelector(LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR) ||
    element.querySelector('[data-ad-preview="message"], [componentkey^="feed-commentary"], [componentkey*="feed-commentary"]') ||
    element.querySelector('.feed-shared-update-v2__description, .update-components-update-v2__commentary, .update-components-text')
  );
}

function findLinkedInPostElementFromCommentBox(commentBox) {
  if (!commentBox) return null;

  const closestKnownPost = commentBox.closest(LINKEDIN_POST_CONTAINER_SELECTOR);
  if (closestKnownPost && closestKnownPost.tagName !== 'MAIN' && hasLinkedInPostSignals(closestKnownPost)) {
    return closestKnownPost;
  }

  let node = commentBox.parentElement;
  while (node && node !== document.body) {
    if (node.tagName === 'MAIN') return null;
    if (hasLinkedInPostSignals(node)) return node;
    node = node.parentElement;
  }

  return null;
}

function findLinkedInPostHeader(postElement) {
  if (!postElement) return null;

  const legacyHeader = postElement.querySelector('.update-components-actor, .feed-shared-actor, .social-details-social-actor');
  if (legacyHeader) return legacyHeader;

  const control = postElement.querySelector(LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR);
  let node = control && control.parentElement;
  while (node && node !== postElement) {
    if (node.querySelector('a[href*="/in/"], a[href*="/company/"]')) {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

function findReplyContext(commentBox) {
  const replyBox = commentBox.closest('.comments-comment-box--reply, .social-details-social-comment-box--reply, [class*="comment-box"][class*="reply"]');
  if (!replyBox) return null;

  const directComment = replyBox.closest('article.comments-comment-entity, .comments-comment-entity');
  if (directComment) return directComment;

  let node = replyBox.previousElementSibling;
  while (node) {
    if (node.matches && node.matches('article.comments-comment-entity, .comments-comment-entity')) {
      return node;
    }
    const nestedComment = node.querySelector && node.querySelector('article.comments-comment-entity, .comments-comment-entity');
    if (nestedComment) return nestedComment;
    node = node.previousElementSibling;
  }

  return null;
}

// New function to extract both post text and author
function extractPostInfo(postElement, commentBox) {
  const scopedPostElement = findLinkedInPostElementFromCommentBox(commentBox) || postElement;

  // Check if this is a reply to a comment
  if (commentBox) {
    const parentArticle = findReplyContext(commentBox);
    if (parentArticle) {
      const commentTextElem = findFirstWithText(parentArticle, [
        '.comments-comment-item__main-content',
        '.comments-comment-item__inline-show-more-text',
        '.comments-comment-item-content-body',
        '[class*="comments-comment-item"][class*="content"]',
        '.feed-shared-inline-show-more-text'
      ]);

      const commentAuthorElem = findFirstWithText(parentArticle, [
        '.comments-comment-meta__description-title',
        '.comments-comment-meta__actor-name',
        '.comments-post-meta__name',
        '.comments-comment-meta__description-container span[aria-hidden="true"]',
        'a[href*="/in/"] span[aria-hidden="true"]',
        'a[href*="/company/"] span[aria-hidden="true"]'
      ]);

      if (commentTextElem || commentAuthorElem) {
        const postText = getElementText(commentTextElem);
        const postAuthor = getElementText(commentAuthorElem);
        console.log('[Butterfly] Replying to comment - Author:', postAuthor, 'Text:', postText);
        return { postText, postAuthor };
      }
    }
  }
  
  // Fallback to main post extraction
  // Try to extract the main post text
  const mainTextElem = findFirstWithText(scopedPostElement, [
    '[data-ad-preview="message"]',
    '.feed-shared-update-v2__description',
    '.update-components-text',
    '.feed-shared-inline-show-more-text',
    '.update-components-update-v2__commentary',
    '[dir="ltr"]'
  ]);
  const postText = getElementText(mainTextElem);

  // Try post header controls first. The redesigned feed exposes the exact
  // author in aria labels even when class names are obfuscated.
  const authorFromControls = findFirstAuthorName(scopedPostElement, [
    LINKEDIN_POST_AUTHOR_CONTROL_SELECTOR
  ]);

  const visibleHeader = findLinkedInPostHeader(scopedPostElement);
  let postAuthor = authorFromControls || findFirstAuthorName(visibleHeader, [
    'a[href*="/in/"] img[alt]',
    'a[href*="/company/"] img[alt]',
    'a[href*="/in/"] svg[aria-label]',
    'a[href*="/company/"] svg[aria-label]',
    'a[href*="/in/"][aria-label]',
    'a[href*="/company/"][aria-label]',
    '.feed-shared-actor__name',
    '.update-components-actor__name',
    '.feed-shared-actor__meta a',
    '.update-components-actor__meta a',
    '.update-components-actor__title span[aria-hidden="true"]',
    '.feed-shared-actor__title span[aria-hidden="true"]',
    '.update-components-actor__title',
    '.feed-shared-actor__title',
    '.feed-shared-actor__container-link span[aria-hidden="true"]',
    '.update-components-actor__container-link span[aria-hidden="true"]',
    '.social-details-social-actor__name',
    '.social-details-social-actor__title span[aria-hidden="true"]',
    '.actor-name',
    'span[dir="ltr"] span[aria-hidden="true"]',
    '[aria-label*="  1st"]',
    '[aria-label*="  2nd"]',
    '[aria-label*="  3rd"]',
    'a[href*="/in/"] span[aria-hidden="true"]',
    'a[href*="/company/"] span[aria-hidden="true"]'
  ]);

  // Fallback: try first anchor or span in likely header containers
  if (!postAuthor) {
    const header = scopedPostElement.querySelector('.feed-shared-actor, .update-components-actor');
    if (header) {
      postAuthor = getElementAuthorName(header.querySelector('a, span'));
    }
  }

  // Debug: log all possible candidates
  // const candidates = postElement.querySelectorAll('.feed-shared-actor__name, .update-components-actor__name, .feed-shared-actor__meta a, .update-components-actor__meta a, .feed-shared-actor a, .update-components-actor a, a, span');
  // console.log('[Butterfly] Author candidates:', candidates);
  if (!postAuthor) {
    postAuthor = findFirstAuthorName(visibleHeader, [
      'a[href*="/company/"] span[aria-hidden="true"]',
      'a[href*="/in/"] span[aria-hidden="true"]',
      'span[aria-hidden="true"]'
    ]);
  }
  console.log('[Butterfly] Selected author:', postAuthor);
  return { postText, postAuthor };
}

// Update getGeminiSuggestion to accept both postText, postAuthor, refinement, and currentComment
async function getGeminiSuggestion(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('[Butterfly LinkedIn] Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });
  // Send message to background for Gemini API call
  return new Promise((resolve) => {
    try {
      // Check if extension context is valid
      if (!isExtensionContextValid()) {
        console.error('[Butterfly LinkedIn] Extension context is not available');
        showContextInvalidatedMessage();
        resolve({ error: 'Extension context lost. Please refresh the page.' });
        return;
      }
      
      chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', site: 'linkedin', postText, postAuthor, refinement, currentComment }, (response) => {
        // Check for chrome.runtime.lastError which indicates extension context issues
        if (chrome.runtime.lastError) {
          console.error('[Butterfly] Extension context error:', chrome.runtime.lastError);
          if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('context invalidated')) {
            showContextInvalidatedMessage();
          }
          resolve({ error: 'Extension was updated. Please refresh the page to continue using Butterfly.' });
          return;
        }
        if (response && response.error) {
          console.error('[Butterfly] API error:', response.error);
          resolve({ error: response.error });
        } else if (response && response.disabled) {
          resolve({ disabled: true });
        } else if (response && response.suggestions) {
          // Log debug prompt if available
          if (response.debugPrompt) {
            console.log('[Butterfly LinkedIn] Debug - Full prompt sent to API:\n', response.debugPrompt);
          }
          resolve({ suggestions: response.suggestions });
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
    // Check if extension context is valid first
    if (!isExtensionContextValid()) {
      console.log('[Butterfly LinkedIn] Extension context not valid, skipping initialization');
      return;
    }
    
    chrome.storage.sync.get(['enabledPlatforms'], (result) => {
      // Check for chrome.runtime.lastError which indicates context issues
      if (chrome.runtime.lastError) {
        console.log('[Butterfly LinkedIn] Chrome runtime error:', chrome.runtime.lastError);
        if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('context invalidated')) {
          showContextInvalidatedMessage();
        }
        return;
      }
      
      const enabledPlatforms = result.enabledPlatforms || {
        linkedin: true,
        twitter: false,
        producthunt: true,
        reddit: true
      };
      linkedinEnabled = enabledPlatforms.linkedin !== false;
      
      // Only proceed if LinkedIn is enabled
      if (!linkedinEnabled) {
        console.log('[Butterfly LinkedIn] Extension is disabled for LinkedIn');
        removeLinkedInUI();
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
refreshLinkedInEnabled();
setInterval(refreshLinkedInEnabled, 5000);
// Fallback: periodic scan in case observer misses something
const scanInterval = setInterval(() => {
  // Stop scanning if extension context is invalidated
  if (!isExtensionContextValid()) {
    clearInterval(scanInterval);
    console.log('[Butterfly LinkedIn] Stopping periodic scan due to context invalidation');
    return;
  }
  if (!linkedinEnabled) {
    removeLinkedInUI();
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
    '.social-details-social-comment-box .ql-editor[contenteditable="true"]',
    '.social-details-social-comment-box [contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    '[data-lexical-editor="true"][contenteditable="true"]',
    '.comments-comment-box [contenteditable="true"]',
    '.comments-comment-texteditor [contenteditable="true"]',
    '.comments-comment-texteditor__content [contenteditable="true"]',
    '.comments-comment-box-comment__text-editor [contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder*="comment" i]',
    'div[contenteditable="true"][data-placeholder*="reply" i]',
    'div[contenteditable="true"][aria-placeholder*="comment" i]',
    'div[contenteditable="true"][aria-placeholder*="reply" i]',
    'div[role="textbox"][contenteditable="true"][aria-label*="comment" i]',
    'div[role="textbox"][contenteditable="true"][aria-label*="reply" i]',
    'div[contenteditable="true"][aria-label*="Add a comment" i]',
    'div[contenteditable="true"][aria-label*="Add a reply" i]',
    'textarea[aria-label="Add a comment…"]',
    'textarea[aria-label="Add a comment..."]',
    'textarea[aria-label*="Add a comment" i]',
    'textarea[aria-label*="Add a reply" i]',
    'textarea[name="comment"]',
  ];

  // Helper to find the post element from a comment box
  function findPostElementFromCommentBox(box) {
    return findLinkedInPostElementFromCommentBox(box)
      || box.closest('.feed-shared-update-v2, .update-components-update, .occludable-update, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]')
      || box.closest('article:not(.comments-comment-entity), [role="article"]:not(.comments-comment-entity)')
      || null;
  }

  function findCommentComposer(box) {
    return box.closest('.comments-comment-box, .social-details-social-comment-box, form.comments-comment-box')
      || box.closest('.comments-comment-texteditor, .comments-comment-texteditor__content, .comments-comment-box-comment__text-editor')
      || box.parentElement;
  }

  function isLinkedInCommentBox(box) {
    if (!box || box.dataset.butterflyUiContainer === 'true') return false;
    if (box.closest('.butterfly-ui-container')) return false;
    if (box.closest('.share-box-feed-entry, .share-creation-state, .share-box, [data-test-modal-id="share-box"]')) return false;
    if (box.closest('.comments-comment-box, .comments-comment-texteditor, .comments-comment-texteditor__content, .comments-comment-box-comment__text-editor, .social-details-social-comment-box, form.comments-comment-box')) return true;

    const label = [
      box.getAttribute('aria-label'),
      box.getAttribute('aria-placeholder'),
      box.getAttribute('data-placeholder'),
      box.getAttribute('placeholder')
    ].filter(Boolean).join(' ').toLowerCase();

    if (label.includes('comment') || label.includes('reply')) return true;

    return Boolean(
      box.classList.contains('ql-editor') &&
      findPostElementFromCommentBox(box) &&
      box.closest('.feed-shared-update-v2, .update-components-update, .occludable-update, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]')
    );
  }

  function getCanonicalCommentBox(box) {
    if (!box) return null;
    if (!box.isContentEditable) return box;

    if (box.querySelector('[contenteditable="true"]')) {
      return box.querySelector(
        '.ql-editor[contenteditable="true"], [data-lexical-editor="true"][contenteditable="true"], div[role="textbox"][contenteditable="true"], [contenteditable="true"]'
      );
    }

    const nestedEditor = box.querySelector(
      '.ql-editor[contenteditable="true"], [data-lexical-editor="true"][contenteditable="true"], div[role="textbox"][contenteditable="true"]'
    );
    return nestedEditor || box;
  }

  function setLexicalEditorValue(box, value) {
    try {
      const editor = box.__lexicalEditor;
      if (!editor || typeof editor.parseEditorState !== 'function' || typeof editor.setEditorState !== 'function') {
        return false;
      }

      const editorState = editor.parseEditorState(JSON.stringify({
        root: {
          children: [{
            children: [{ detail: 0, format: 0, mode: 'normal', text: value, type: 'text', version: 1 }],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1
          }],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1
        }
      }));
      editor.setEditorState(editorState);
      return true;
    } catch (error) {
      console.warn('[Butterfly LinkedIn] Failed to set Lexical editor state, falling back to DOM insertion:', error);
      return false;
    }
  }

  function setContentEditableValue(box, value) {
    if (setLexicalEditorValue(box, value)) {
      box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      return;
    }

    box.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    selection.removeAllRanges();
    selection.addRange(range);

    const inserted = document.execCommand && document.execCommand('insertText', false, value);
    if (!inserted || cleanLinkedInText(box.innerText || box.textContent) !== cleanLinkedInText(value)) {
      box.textContent = value;
    }

    selection.removeAllRanges();
    const endRange = document.createRange();
    endRange.selectNodeContents(box);
    endRange.collapse(false);
    selection.addRange(endRange);

    box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setCommentBoxValue(box, value) {
    if (box.isContentEditable) {
      setContentEditableValue(box, value);
    } else {
      box.value = value;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function performInitialAutoSuggestion(box, postElement, suggestBtn) {
    if (!linkedinEnabled) return;
    const isEmpty = (box.isContentEditable && getElementText(box) === '') ||
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
      
      if (result.error) {
        console.error('[Butterfly] Auto-suggestion error:', result.error);
        // Display error message directly in the comment field
        const errorMessage = `[Error: ${result.error}]`;
        setCommentBoxValue(box, errorMessage);
      } else if (result.disabled) {
        removeLinkedInUI();
        return;
      } else if (result.suggestions && result.suggestions.length > 0) {
        // Use the first suggestion as the default
        setCommentBoxValue(box, result.suggestions[0]);
        console.log('[Butterfly] Auto-suggestion applied.');
        addInteractionButtons(box, postElement, suggestBtn, result.suggestions);
        addVariantsDropdown(box, result.suggestions, 0);
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
    document.querySelectorAll('.butterfly-variants-container, .butterfly-variants-dropdown').forEach(element => element.remove());
    
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
    dropdown.style.cssText = 'display: none; position: fixed; background: white; color: #24292e; border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 350px; max-width: calc(100vw - 20px); z-index: 2147483647; max-height: 300px; overflow-y: auto;';
    
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

      if (dropdown.style.display === 'none') {
        dropdown.style.display = 'block';

        const btnRect = variantsBtn.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const gap = 8;

        if (btnRect.top >= dropdownRect.height + gap) {
          dropdown.style.top = 'auto';
          dropdown.style.bottom = (viewportHeight - btnRect.top + gap) + 'px';
        } else {
          dropdown.style.top = Math.max(gap, Math.min(btnRect.bottom + gap, viewportHeight - dropdownRect.height - gap)) + 'px';
          dropdown.style.bottom = 'auto';
        }

        let left = btnRect.left;
        if (left + dropdownRect.width > viewportWidth - gap) {
          left = viewportWidth - dropdownRect.width - gap;
        }
        dropdown.style.left = Math.max(gap, left) + 'px';
      } else {
        dropdown.style.display = 'none';
      }
    };
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!variantsContainer.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
    
    variantsContainer.appendChild(variantsBtn);
    document.body.appendChild(dropdown);
    
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
      if (!linkedinEnabled) {
        removeLinkedInUI();
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
      let currentComment = box.isContentEditable ? getElementText(box) : box.value;
      const { postText, postAuthor } = extractPostInfo(postElement, box);
      const result = await getGeminiSuggestion(postText, postAuthor, instructions, currentComment);
      if (result.error) {
        // Display error message directly in the comment field
        const errorMessage = `[Error: ${result.error}]`;
        setCommentBoxValue(box, errorMessage);
      } else if (result.disabled) {
        removeLinkedInUI();
        return;
      } else if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0]);
        addVariantsDropdown(box, result.suggestions, 0);
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
    if (!linkedinEnabled) return;
    const composer = findCommentComposer(box);
    if (!composer) return;

    // Assign unique ID to comment box
    if (!box.dataset.butterflyId) {
      box.dataset.butterflyId = 'li-cb-' + Date.now() + Math.random().toString(36).substring(2, 7);
    }

    const existingContainers = composer.querySelectorAll('.butterfly-ui-container');
    if (existingContainers.length > 0) {
      existingContainers.forEach((container, index) => {
        if (index > 0) container.remove();
      });
      composer.dataset.butterflyInjected = 'true';
      return;
    }

    if (box.dataset.butterflyInjected === 'true' || composer.dataset.butterflyInjected === 'true') return;
    composer.dataset.butterflyInjected = 'true';
    box.dataset.butterflyInjected = 'true';
    
    // Create UI container
    const uiContainer = document.createElement('div');
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
      if (!linkedinEnabled) {
        removeLinkedInUI();
        return;
      }
      
      const originalText = suggestBtn.textContent;
      suggestBtn.disabled = true;
      suggestBtn.textContent = 'Thinking...';
      const { postText, postAuthor } = extractPostInfo(postElement, box);
      const result = await getGeminiSuggestion(postText, postAuthor);
      if (result.error) {
        // Display error message directly in the comment field
        const errorMessage = `[Error: ${result.error}]`;
        setCommentBoxValue(box, errorMessage);
      } else if (result.disabled) {
        removeLinkedInUI();
        return;
      } else if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0]);
        addInteractionButtons(box, postElement, suggestBtn, result.suggestions);
        addVariantsDropdown(box, result.suggestions, 0);
      }
      suggestBtn.disabled = false;
      suggestBtn.textContent = originalText;
    };
    
    // Attempt initial auto-suggestion
    performInitialAutoSuggestion(box, postElement, suggestBtn);
  }

  async function scanAndFill() {
    if (!linkedinEnabled) {
      removeLinkedInUI();
      return;
    }
    // Leading-edge throttle per comment box (1s)
    const seenBoxes = new Set();
    const seenComposers = new Set();
    for (const sel of COMMENT_SELECTORS) {
      const boxes = document.querySelectorAll(sel);
      for (const matchedBox of boxes) {
        const box = getCanonicalCommentBox(matchedBox);
        if (!box || seenBoxes.has(box)) continue;
        seenBoxes.add(box);
        if (!isLinkedInCommentBox(box)) continue;
        const composer = findCommentComposer(box);
        if (!composer || seenComposers.has(composer)) continue;
        seenComposers.add(composer);
        const now = Date.now();
        const last = butterflyLastFillTime.get(composer) || 0;
        if (now - last >= 1000) {
          butterflyLastFillTime.set(composer, now);
          const postElement = findPostElementFromCommentBox(box);
          if (postElement && composer.querySelectorAll('.butterfly-ui-container').length > 1) {
            composer.querySelectorAll('.butterfly-ui-container').forEach((container, index) => {
              if (index > 0) container.remove();
            });
          }
          if (postElement && !composer.dataset.butterflyInjected) {
            injectUI(box, postElement);
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
