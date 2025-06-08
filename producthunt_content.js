// producthunt_content.js - Injects AI comment UI for Product Hunt

console.log('[Butterfly] Product Hunt content script loaded');

function injectPHButtonStyles() {
  const styleId = 'butterfly-ph-styles';
  if (document.getElementById(styleId)) return;

  const css = `
    .butterfly-ui-container {
        display: flex; /* Arrange buttons in a row */
        align-items: center; /* Align items vertically */
        margin-top: 5px; /* Space above the button container */
        flex-wrap: wrap; /* Allow buttons to wrap on small screens */
    }
    .butterfly-btn {
      background-color: SlateBlue; /* Main color */
      color: white;
      padding: 6px 12px;
      border: 1px solid #40528A; /* Slightly darker for border */
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
      background-color: #5A6AAD; /* Lighter for hover */
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .butterfly-btn:disabled {
      background-color: #9FA8DA; /* Lighter, less prominent when disabled */
      color: #E8EAF6; /* Very light text for disabled state */
      cursor: not-allowed;
      box-shadow: none;
    }
  `;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
  console.log('[Butterfly PH] Custom button styles injected.');
}

injectPHButtonStyles(); // Call it once at the start

function setCommentBoxValue(commentBox, value) {
  if (commentBox.isContentEditable) {
    commentBox.innerHTML = ''; // Clear previous content, e.g., <p><br></p>
    const p = document.createElement('p'); // PH TipTap usually wraps lines in <p>
    p.innerText = value;
    commentBox.appendChild(p);

    // Move cursor to end of the content
    commentBox.focus(); // Ensure the editor is focused to receive selection
    
    // Wrap in try-catch to handle cases where range operations fail
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      if (sel.rangeCount > 0) sel.removeAllRanges(); // Clear existing selections

      // Make sure the element is in the document before creating a range
      if (commentBox.lastChild && commentBox.lastChild.parentNode) {
        range.selectNodeContents(commentBox.lastChild);
        range.collapse(false); // Collapse to the end
        sel.addRange(range);
      } else if (commentBox.parentNode) {
        // Fallback: just focus the element without setting cursor position
        range.selectNodeContents(commentBox);
        range.collapse(false);
        sel.addRange(range);
      }
    } catch (e) {
      console.warn('[Butterfly PH] Failed to set cursor position:', e);
      // Continue execution - the text is already inserted
    }
  } else {
    commentBox.value = value;
    commentBox.focus();
  }
  commentBox.dispatchEvent(new Event('input', { bubbles: true }));
}

function extractProductInfo(contextElement) {
  // Selectors for product information. These might need further refinement by inspecting the main product page area.
  // Product Hunt's structure can change, so robust selectors are key.

  // Try to find product name (often an H1, might have specific attributes or be within a known parent)
  const productNameElem = contextElement.querySelector('h1[class*="title"], h1[data-test*="product-name"], header h1, main h1');
  const productName = productNameElem ? productNameElem.innerText.trim() : 'Unknown Product';

  // Try to find product tagline (often a P near H1 or with specific attributes)
  const productTaglineElem = contextElement.querySelector('p[class*="tagline"], p[data-test*="product-tagline"], h1 + p, header p');
  const productTagline = productTaglineElem ? productTaglineElem.innerText.trim() : '';

  // Try to find maker's name. This is often a link with user profile structure.
  // Looking for a link that likely contains an avatar and the maker's name.
  // This is a guess and might need specific selectors from the maker section of a PH page.
  const makerNameElem = contextElement.querySelector('a[href*="/@"][class*="user"], div[data-test*="maker"] a[href*="/@"], a[class*="makerName"], div[class*="styles_userName"]');
  const makerName = makerNameElem ? makerNameElem.innerText.trim().split('\n')[0] : ''; // Take first line if multiple, fallback to empty string

  let postText = `Product: ${productName}`;
  if (productTagline) postText += `\nTagline: ${productTagline}`;
  const postAuthor = makerName;

  console.log('[Butterfly PH] Extracted Info:', { productName, productTagline, makerName, postText, postAuthor });
  return { postText, postAuthor };
}

async function getGeminiSuggestionForProductHunt(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('[Butterfly PH] Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'GEMINI_SUGGEST', site: 'producthunt', postText, postAuthor, refinement, currentComment },
        (response) => {
          // Check for chrome.runtime.lastError which indicates extension context issues
          if (chrome.runtime.lastError) {
            console.error('[Butterfly PH] Extension context error:', chrome.runtime.lastError);
            resolve('Extension was updated. Please refresh the page to continue using Butterfly.');
            return;
          }
          resolve(response && response.suggestion);
        }
      );
    } catch (error) {
      console.error('[Butterfly PH] Failed to send message:', error);
      resolve('Extension was updated. Please refresh the page to continue using Butterfly.');
    }
  });
}

async function performInitialAutoSuggestion(commentBox, postElement, suggestBtn) {
  const isEmpty = (commentBox.isContentEditable && (commentBox.innerText.trim() === '' || commentBox.innerHTML.toLowerCase() === '<p><br></p>' || commentBox.innerHTML.toLowerCase() === '')) ||
    (!commentBox.isContentEditable && commentBox.value.trim() === '');

  if (isEmpty && !commentBox.dataset.butterflyAutoSuggested) {
    console.log('[Butterfly PH] Comment box is empty, attempting auto-suggestion.');
    commentBox.dataset.butterflyAutoSuggested = 'true'; // Mark as attempted

    const originalSuggestText = suggestBtn.textContent;
    suggestBtn.disabled = true;
    suggestBtn.textContent = 'Auto-suggesting...';

    // Hide regenerate/refine if they somehow exist already (should not happen here)
    const uiContainer = suggestBtn.parentElement;
    uiContainer.querySelectorAll('.butterfly-ph-regenerate-btn, .butterfly-ph-refine-btn').forEach(btn => btn.style.display = 'none');

    const { postText, postAuthor } = extractProductInfo(postElement);
    const suggestion = await getGeminiSuggestionForProductHunt(postText, postAuthor);

    if (suggestion) {
      setCommentBoxValue(commentBox, suggestion);
      console.log('[Butterfly PH] Auto-suggestion applied.');
      addInteractionButtons(commentBox, postElement, suggestBtn); // Add/update interaction buttons
    } else {
      console.log('[Butterfly PH] Auto-suggestion failed or returned empty.');
      // commentBox.dataset.butterflyAutoSuggested = 'false'; // Optional: allow retry on next focus if API fails. For now, one attempt.
    }

    suggestBtn.disabled = false;
    suggestBtn.textContent = originalSuggestText;
    uiContainer.querySelectorAll('.butterfly-ph-regenerate-btn, .butterfly-ph-refine-btn').forEach(btn => btn.style.display = '');
  }
}

function injectUI(commentBox, postElement) {
  let uiContainer = commentBox.parentElement.querySelector('.butterfly-ui-container[data-commentbox-id="' + commentBox.dataset.butterflyId + '"]');
  if (uiContainer) {
    return; // UI already injected for this specific comment box
  }

  // Assign a unique ID to the comment box if it doesn't have one, for linking with UI container
  if (!commentBox.dataset.butterflyId) {
    commentBox.dataset.butterflyId = 'ph-cb-' + Date.now() + Math.random().toString(36).substring(2, 7);
  }

  uiContainer = document.createElement('div');
  uiContainer.className = 'butterfly-ui-container';
  uiContainer.dataset.commentboxId = commentBox.dataset.butterflyId;

  const suggestBtn = document.createElement('button');
  suggestBtn.textContent = 'Suggest Comment ✨';
  suggestBtn.className = 'butterfly-ph-suggest-btn butterfly-btn';
  uiContainer.appendChild(suggestBtn);

  // Insert the container. Product Hunt's structure might mean commentBox.nextSibling is not ideal.
  // Try to place it consistently. If commentBox is wrapped, its parent might be better.
  // For TipTap, the commentBox is the editor itself. Its parent is likely the form control wrapper.
  commentBox.parentElement.insertBefore(uiContainer, commentBox.nextSibling);

  suggestBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const originalText = suggestBtn.textContent;
    suggestBtn.disabled = true;
    suggestBtn.textContent = 'Thinking...';
    const { postText, postAuthor } = extractProductInfo(postElement);
    const suggestion = await getGeminiSuggestionForProductHunt(postText, postAuthor);
    if (suggestion) {
      setCommentBoxValue(commentBox, suggestion);
    }
    suggestBtn.disabled = false;
    suggestBtn.textContent = originalText;
    addInteractionButtons(commentBox, postElement, suggestBtn);
  };

  // Attempt initial auto-suggestion
  performInitialAutoSuggestion(commentBox, postElement, suggestBtn);
}

function addInteractionButtons(commentBox, postElement, suggestBtnInstance) {
  const uiContainer = commentBox.parentElement.querySelector('.butterfly-ui-container[data-commentbox-id="' + commentBox.dataset.butterflyId + '"]');
  if (!uiContainer) {
    console.error("[Butterfly PH] UI container not found for interaction buttons. CommentBox ID:", commentBox.dataset.butterflyId);
    return;
  }

  // Remove existing regenerate/refine buttons from this specific container
  uiContainer.querySelectorAll('.butterfly-ph-regenerate-btn, .butterfly-ph-refine-btn').forEach(btn => btn.remove());

  const regenerateBtn = document.createElement('button');
  regenerateBtn.textContent = 'Regenerate';
  regenerateBtn.className = 'butterfly-ph-regenerate-btn butterfly-btn';
  regenerateBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const originalSuggestText = suggestBtnInstance ? suggestBtnInstance.textContent : 'Suggest Comment ✨';
    regenerateBtn.disabled = true;
    regenerateBtn.textContent = 'Generating...';
    if (suggestBtnInstance) suggestBtnInstance.disabled = true;

    const { postText, postAuthor } = extractProductInfo(postElement);
    const newSuggestion = await getGeminiSuggestionForProductHunt(postText, postAuthor);
    if (newSuggestion) {
      setCommentBoxValue(commentBox, newSuggestion);
    }
    regenerateBtn.disabled = false;
    regenerateBtn.textContent = 'Regenerate';
    if (suggestBtnInstance) {
      suggestBtnInstance.disabled = false;
      suggestBtnInstance.textContent = originalSuggestText; // Restore original text if it was changed
    }
  };
  uiContainer.appendChild(regenerateBtn);

  const refineBtn = document.createElement('button');
  refineBtn.textContent = 'Refine';
  refineBtn.className = 'butterfly-ph-refine-btn butterfly-btn';
  refineBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
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
    
    let currentCommentText = commentBox.isContentEditable ? commentBox.innerText : commentBox.value;
    const { postText, postAuthor } = extractProductInfo(postElement);
    const newSuggestion = await getGeminiSuggestionForProductHunt(postText, postAuthor, instructions, currentCommentText);
    if (newSuggestion) {
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

function findCommentBoxAndPost(postElement) {
  // Placeholder: Find the comment box related to this postElement
  // This selector will be specific to Product Hunt's structure.
  // It might be a direct child, sibling, or found by traversing up and then down.
  // Updated selector for content-editable div used by Product Hunt's comment editor
  const commentBox = postElement.querySelector('div.tiptap.ProseMirror[contenteditable="true"]');
  return commentBox;
}

function scanAndInjectProductHunt() {
  // Selector for Product Hunt posts on listing pages (e.g., /posts) - this remains a general placeholder
  const postItems = document.querySelectorAll('div[class*="styles_postItem_"], article[class*="postListItem"]');
  postItems.forEach(postElement => {
    const commentBoxInPostItem = findCommentBoxAndPost(postElement); // Tries to find a comment box *within* the post item summary
    if (commentBoxInPostItem && !commentBoxInPostItem.dataset.butterflyPhInjected) {
      console.log('[Butterfly PH] Found comment box in post item:', postElement, commentBoxInPostItem);
      injectUI(commentBoxInPostItem, postElement);
      commentBoxInPostItem.dataset.butterflyPhInjected = 'true';
    }
  });

  // Selector for the main comment form's editor on a single product page (based on provided HTML)
  // This targets the contenteditable div within the form identified by data-test="comment-form"
  const mainPageCommentEditor = document.querySelector('form[data-test="comment-form"] div.tiptap.ProseMirror[contenteditable="true"]');
  if (mainPageCommentEditor && !mainPageCommentEditor.dataset.butterflyPhInjected) {
    // For a single product page, the context for extractProductInfo is the whole document or main content area.
    const productPageContext = document.querySelector('main') || document.body;
    console.log('[Butterfly PH] Found main product page comment editor:', mainPageCommentEditor);
    injectUI(mainPageCommentEditor, productPageContext);
    mainPageCommentEditor.dataset.butterflyPhInjected = 'true';
  }

  // Fallback for other potential comment boxes not caught by the above (e.g., reply boxes)
  // This looks for any TipTap editor that hasn't been processed yet.
  const allCommentEditors = document.querySelectorAll('div.tiptap.ProseMirror[contenteditable="true"]');
  allCommentEditors.forEach(editor => {
    if (!editor.dataset.butterflyPhInjected) {
      const postContext = editor.closest('div[class*="styles_postItem_"], article[class*="postListItem"], main') || document.body;
      console.log('[Butterfly PH] Found fallback comment editor:', editor);
      injectUI(editor, postContext);
      editor.dataset.butterflyPhInjected = 'true';
    }
  });
}

// --- SPA Navigation & Robust Observer --- (Similar to content.js)
let phCurrentFeed = null;
let phFeedObserver = null;
let phLastUrl = location.href;

function phObserveFeed() {
  // Product Hunt might load content into a specific main area
  const feed = document.querySelector('main, div#__next'); // Adjust selector for PH's main content area
  if (feed && feed !== phCurrentFeed) {
    if (phFeedObserver) phFeedObserver.disconnect();
    phCurrentFeed = feed;
    phFeedObserver = new MutationObserver(scanAndInjectProductHunt);
    phFeedObserver.observe(feed, { childList: true, subtree: true });
    console.log('[Butterfly PH] Observer attached to:', feed);
  }
}

function phOnUrlChange() {
  if (location.href !== phLastUrl) {
    phLastUrl = location.href;
    console.log('[Butterfly PH] URL changed to:', phLastUrl);
    scanAndInjectProductHunt(); // Initial scan on new URL
    phObserveFeed(); // Re-observe if main content area changes
  }
}

// Listen for URL changes (common in SPAs)
window.addEventListener('popstate', phOnUrlChange);
window.addEventListener('pushstate', phOnUrlChange); // If PH uses pushState
window.addEventListener('replacestate', phOnUrlChange); // If PH uses replaceState

// Custom event for SPAs that don't always trigger popstate/pushstate
(function () {
  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    window.dispatchEvent(new Event('pushstate'));
  };
  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    window.dispatchEvent(new Event('replacestate'));
  };
})();

// Initial scan and observer setup
setTimeout(() => { // Delay slightly to ensure page elements are more likely to be loaded
  scanAndInjectProductHunt();
  phObserveFeed();
}, 1000);

// Fallback: periodic scan in case observer misses something or for dynamic content outside observed root
setInterval(() => {
  scanAndInjectProductHunt();
}, 3000);

console.log('[Butterfly] Product Hunt content script execution finished.');

