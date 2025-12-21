// content_reddit_old.js - Injects AI comment UI for old.reddit.com

console.log('[Butterfly] Old Reddit content script loaded');

function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id;
  } catch (e) {
    console.log('[Butterfly Reddit] Extension context invalidated - page reload required');
    return false;
  }
}

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

function setCommentBoxValue(box, value) {
  box.value = value;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

function showInlineStatus(uiContainer, message) {
  if (!uiContainer) return;
  const existing = uiContainer.querySelector('.butterfly-inline-status');
  if (existing) existing.remove();
  
  const status = document.createElement('span');
  status.className = 'butterfly-inline-status';
  status.textContent = `${message}?`;
  status.title = 'Enable Reddit in Butterfly settings: click the 🦋 icon, check "Reddit (old.reddit.com)", then try again.';
  status.style.cssText = 'margin-left: 8px; font-size: 12px; color: #6b7280; text-decoration: underline dotted; cursor: help;';
  uiContainer.appendChild(status);
}

function extractPostInfo(box) {
  const parentComment = box.closest('.comment');
  if (parentComment) {
    const commentTextElem = parentComment.querySelector('.usertext-body .md') || parentComment.querySelector('.md');
    const commentAuthorElem = parentComment.querySelector('a.author');
    if (commentTextElem || commentAuthorElem) {
      return {
        postText: commentTextElem ? commentTextElem.innerText.trim() : '',
        postAuthor: commentAuthorElem ? commentAuthorElem.innerText.trim() : ''
      };
    }
  }
  
  const linkThing = box.closest('.thing.link') || document.querySelector('.thing.link');
  const titleElem = linkThing ? linkThing.querySelector('a.title') : null;
  const selfTextElem = linkThing ? linkThing.querySelector('.usertext-body .md') : null;
  const authorElem = linkThing ? linkThing.querySelector('a.author') : null;
  
  let postText = '';
  if (titleElem) {
    postText += titleElem.innerText.trim();
  }
  if (selfTextElem) {
    postText += postText ? '\n\n' + selfTextElem.innerText.trim() : selfTextElem.innerText.trim();
  }
  
  return {
    postText,
    postAuthor: authorElem ? authorElem.innerText.trim() : ''
  };
}

async function getGeminiSuggestion(postText, postAuthor, refinement = '', currentComment = '') {
  console.log('[Butterfly Reddit] Gemini suggestion request:', { postText, postAuthor, refinement, currentComment });
  return new Promise((resolve) => {
    try {
      if (!isExtensionContextValid()) {
        console.error('[Butterfly Reddit] Extension context not available');
        showContextInvalidatedMessage();
        resolve({ error: 'Extension context lost. Please refresh the page.' });
        return;
      }
      
      chrome.runtime.sendMessage({ type: 'GEMINI_SUGGEST', site: 'reddit', postText, postAuthor, refinement, currentComment }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Butterfly Reddit] Extension context error:', chrome.runtime.lastError);
          if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('context invalidated')) {
            showContextInvalidatedMessage();
          }
          resolve({ error: 'Extension was updated. Please refresh the page to continue using Butterfly.' });
          return;
        }
        if (response && response.error) {
          console.error('[Butterfly Reddit] API error:', response.error);
          resolve({ error: response.error });
        } else if (response && response.disabled) {
          resolve({ disabled: true });
        } else if (response && response.suggestions) {
          if (response.debugPrompt) {
            console.log('[Butterfly Reddit] Debug - Full prompt sent to API:\n', response.debugPrompt);
          }
          resolve({ suggestions: response.suggestions });
        } else {
          resolve({ error: 'No suggestion received' });
        }
      });
    } catch (error) {
      console.error('[Butterfly Reddit] Failed to send message:', error);
      resolve({ error: 'Extension was updated. Please refresh the page to continue using Butterfly.' });
    }
  });
}

const butterflyLastFillTime = new WeakMap();
let redditEnabled = true;

function refreshRedditEnabled() {
  if (!isExtensionContextValid()) {
    redditEnabled = false;
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
    redditEnabled = enabledPlatforms.reddit !== false;
  });
}

(function autoFillRedditComments() {
  const COMMENT_SELECTOR = 'form.usertext textarea[name="text"]';
  
  async function performInitialAutoSuggestion(box, suggestBtn) {
    if (!redditEnabled) return;
    const isEmpty = box.value.trim() === '';
    if (isEmpty && !box.dataset.butterflyAutoSuggested) {
      box.dataset.butterflyAutoSuggested = 'true';
      
      const originalSuggestText = suggestBtn.textContent;
      suggestBtn.disabled = true;
      suggestBtn.textContent = 'Auto-suggesting...';
      
      const uiContainer = suggestBtn.parentElement;
      uiContainer.querySelectorAll('.butterfly-refine-btn').forEach(btn => btn.style.display = 'none');
      
      const { postText, postAuthor } = extractPostInfo(box);
      const result = await getGeminiSuggestion(postText, postAuthor);
      
      if (result.error) {
        const errorMessage = `[Error: ${result.error}]`;
        setCommentBoxValue(box, errorMessage);
      } else if (result.disabled) {
        showInlineStatus(uiContainer, 'Disabled for Reddit');
      } else if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0]);
        addInteractionButtons(box, suggestBtn, result.suggestions);
        addVariantsDropdown(box, result.suggestions, 0);
      }
      
      suggestBtn.disabled = false;
      suggestBtn.textContent = originalSuggestText;
      uiContainer.querySelectorAll('.butterfly-refine-btn').forEach(btn => btn.style.display = '');
    }
  }
  
  function addVariantsDropdown(box, suggestions, currentIndex = 0) {
    const form = box.closest('form.usertext');
    const existingDropdown = form ? form.querySelector('.butterfly-variants-container') : null;
    if (existingDropdown) {
      existingDropdown.remove();
    }
    
    if (!suggestions || suggestions.length <= 1) return;
    
    const variantsContainer = document.createElement('div');
    variantsContainer.className = 'butterfly-variants-container';
    variantsContainer.style.cssText = 'position: relative; display: inline-block;';
    
    const variantsBtn = document.createElement('button');
    variantsBtn.className = 'butterfly-variants-btn butterfly-btn';
    variantsBtn.textContent = 'All variants ▼';
    variantsBtn.style.cssText = 'background-color: #6B46C1; color: white; padding: 6px 12px; border: 1px solid #553C9A; border-radius: 5px; cursor: pointer; font-size: 0.85em; font-weight: 500;';
    
    const dropdown = document.createElement('div');
    dropdown.className = 'butterfly-variants-dropdown';
    dropdown.style.cssText = 'display: none; position: absolute; bottom: 100%; left: 0; background: white; border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-bottom: 4px; min-width: 300px; max-width: 400px; z-index: 1000;';
    
    suggestions.forEach((suggestion, index) => {
      const option = document.createElement('div');
      option.className = 'butterfly-variant-option';
      option.style.cssText = 'padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #e1e4e8; font-size: 0.85em; line-height: 1.4;';
      if (index === currentIndex) {
        option.style.backgroundColor = '#f3f6fb';
        option.style.fontWeight = '500';
      }
      
      const displayText = suggestion.length > 100 ? suggestion.substring(0, 100) + '...' : suggestion;
      option.textContent = `${index + 1}. ${displayText}`;
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
        dropdown.querySelectorAll('.butterfly-variant-option').forEach((opt, i) => {
          opt.style.backgroundColor = i === index ? '#f3f6fb' : 'white';
          opt.style.fontWeight = i === index ? '500' : 'normal';
        });
      };
      
      dropdown.appendChild(option);
    });
    
    variantsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    };
    
    document.addEventListener('click', (e) => {
      if (!variantsContainer.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
    
    variantsContainer.appendChild(variantsBtn);
    variantsContainer.appendChild(dropdown);
    
    const uiContainer = form ? form.querySelector('.butterfly-ui-container') : null;
    if (uiContainer) {
      uiContainer.appendChild(variantsContainer);
    }
  }
  
  function addInteractionButtons(box, suggestBtnInstance, suggestions = null) {
    const form = box.closest('form.usertext');
    const uiContainer = form ? form.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]') : null;
    if (!uiContainer) {
      console.error('[Butterfly Reddit] UI container not found for interaction buttons.');
      return;
    }
    
    uiContainer.querySelectorAll('.butterfly-refine-btn').forEach(btn => btn.remove());
    
    const refineBtn = document.createElement('button');
    refineBtn.textContent = 'Refine';
    refineBtn.className = 'butterfly-refine-btn butterfly-btn';
    refineBtn.style.cssText = 'background-color: SlateBlue; color: white; padding: 6px 12px; border: 1px solid #40528A; border-radius: 5px; cursor: pointer; font-size: 0.85em; font-weight: 500;';
    refineBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!redditEnabled) {
        showInlineStatus(uiContainer, 'Disabled for Reddit');
        return;
      }
      
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
      
      const currentComment = box.value;
      const { postText, postAuthor } = extractPostInfo(box);
      const result = await getGeminiSuggestion(postText, postAuthor, instructions, currentComment);
      if (result.error) {
        const errorMessage = `[Error: ${result.error}]`;
        setCommentBoxValue(box, errorMessage);
      } else if (result.disabled) {
        showInlineStatus(uiContainer, 'Disabled for Reddit');
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
  
  function injectUI(box) {
    const form = box.closest('form.usertext');
    if (!form) return;
    
    let uiContainer = form.querySelector('.butterfly-ui-container[data-commentbox-id="' + box.dataset.butterflyId + '"]');
    if (uiContainer) return;
    
    if (!box.dataset.butterflyId) {
      box.dataset.butterflyId = 'rd-cb-' + Date.now() + Math.random().toString(36).substring(2, 7);
    }
    
    uiContainer = document.createElement('div');
    uiContainer.className = 'butterfly-ui-container';
    uiContainer.dataset.commentboxId = box.dataset.butterflyId;
    uiContainer.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; margin-left: 8px;';
    
    const suggestBtn = document.createElement('button');
    suggestBtn.textContent = 'Suggest Comment ✨';
    suggestBtn.className = 'butterfly-suggest-btn butterfly-btn';
    suggestBtn.style.cssText = 'background-color: SlateBlue; color: white; padding: 6px 12px; border: 1px solid #40528A; border-radius: 5px; cursor: pointer; font-size: 0.85em; font-weight: 500;';
    uiContainer.appendChild(suggestBtn);
    
    const buttonsContainer = form.querySelector('.usertext-buttons');
    if (buttonsContainer) {
      buttonsContainer.style.display = 'flex';
      buttonsContainer.style.alignItems = 'center';
      buttonsContainer.style.flexWrap = 'nowrap';
      buttonsContainer.style.gap = '8px';
      const saveButton = buttonsContainer.querySelector('button.save');
      if (saveButton) {
        saveButton.style.marginRight = '0';
        saveButton.style.flexShrink = '0';
      }
      uiContainer.style.marginLeft = '8px';
      uiContainer.style.flexShrink = '0';
      const statusSpan = buttonsContainer.querySelector('.status');
      if (statusSpan) {
        statusSpan.style.marginLeft = 'auto';
        statusSpan.style.flexShrink = '1';
        buttonsContainer.insertBefore(uiContainer, statusSpan);
      } else {
        buttonsContainer.appendChild(uiContainer);
      }
    } else {
      const editContainer = form.querySelector('.usertext-edit') || box;
      editContainer.parentElement.insertBefore(uiContainer, editContainer.nextSibling);
    }
    
    suggestBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!redditEnabled) {
        showInlineStatus(uiContainer, 'Disabled for Reddit');
        return;
      }
      
      if (!isExtensionContextValid()) {
        alert('Extension was updated. Please refresh the page to continue using Butterfly.');
        return;
      }
      
      const originalText = suggestBtn.textContent;
      suggestBtn.disabled = true;
      suggestBtn.textContent = 'Thinking...';
      const { postText, postAuthor } = extractPostInfo(box);
      const result = await getGeminiSuggestion(postText, postAuthor);
      if (result.error) {
        const errorMessage = `[Error: ${result.error}]`;
        setCommentBoxValue(box, errorMessage);
      } else if (result.disabled) {
        showInlineStatus(uiContainer, 'Disabled for Reddit');
      } else if (result.suggestions && result.suggestions.length > 0) {
        setCommentBoxValue(box, result.suggestions[0]);
        addInteractionButtons(box, suggestBtn, result.suggestions);
        addVariantsDropdown(box, result.suggestions, 0);
      }
      suggestBtn.disabled = false;
      suggestBtn.textContent = originalText;
    };
    
    performInitialAutoSuggestion(box, suggestBtn);
  }
  
  async function scanAndFill() {
    if (!isExtensionContextValid()) return;
    if (!redditEnabled) return;
    const boxes = document.querySelectorAll(COMMENT_SELECTOR);
    for (const box of boxes) {
      const now = Date.now();
      const last = butterflyLastFillTime.get(box) || 0;
      if (now - last >= 1000) {
        butterflyLastFillTime.set(box, now);
        if (!box.dataset.butterflyInjected) {
          injectUI(box);
          box.dataset.butterflyInjected = 'true';
        }
      }
    }
  }
  
  const observer = new MutationObserver(scanAndFill);
  observer.observe(document.body, { childList: true, subtree: true });
  refreshRedditEnabled();
  setInterval(refreshRedditEnabled, 5000);
  scanAndFill();
})();
