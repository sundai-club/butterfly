// popup.js - Auto-save Gemini API key and model

const DEFAULT_MODEL_MODE = 'flash';
const MODEL_CHAINS = {
  flash: [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ],
  pro: [
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro'
  ]
};
const MODEL_ALIASES = {
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview'
};

// Auto-save API key with debouncing and auto-test
let apiKeyTimeout;
let testTimeout;
document.getElementById('api-key').addEventListener('input', function() {
  clearTimeout(apiKeyTimeout);
  clearTimeout(testTimeout);
  const key = this.value.trim();
  showKeyPreview(key);
  
  // Save the key
  apiKeyTimeout = setTimeout(() => {
    chrome.storage.sync.set({ geminiApiKey: key });
  }, 500); // Debounce for 500ms
  
  // Auto-test the key after user stops typing
  if (key && key.length > 10) {
    testTimeout = setTimeout(() => {
      testApiKey(key);
    }, 1000); // Wait 1 second after typing stops
  }
});

// Auto-save model mode selection
document.getElementById('model-picker').addEventListener('change', function() {
  chrome.storage.sync.set({ geminiModel: this.value });
});

function normalizeModelMode(modelModeOrLegacyModel) {
  const value = typeof modelModeOrLegacyModel === 'string' ? modelModeOrLegacyModel.trim() : '';
  if (value === 'flash' || value === 'pro') return value;

  const normalizedLegacyModel = MODEL_ALIASES[value] || value;
  if (MODEL_CHAINS.pro.includes(normalizedLegacyModel)) return 'pro';
  if (MODEL_CHAINS.flash.includes(normalizedLegacyModel)) return 'flash';

  return DEFAULT_MODEL_MODE;
}

// Default prompts for each platform
const defaultPrompts = {
  linkedin: "Write a single, concise, professional congratulatory comment for this LinkedIn post. Use simple, clear language. Only output the final comment — do not include options, explanations, formatting, or any extra text. Include author's name in the comment. IMPORTANT: You MUST write your response in the SAME LANGUAGE as the original post. If the post is in Russian, write in Russian. If in Spanish, write in Spanish. If in English, write in English. Match the language exactly.",
  producthunt: "Write a single, concise, and engaging comment for this Product Hunt post. The comment should be supportive of the product and its creator(s). Use simple, clear language. The comment could highlight a cool feature, ask a question, or express excitement. Only output the final comment — no extra text, options, or formatting. If appropriate and known, mention the product name or the creator's name. IMPORTANT: You MUST write your response in the SAME LANGUAGE as the original post. If the post is in French, write in French. If in Russian, write in Russian. If in English, write in English. Match the language exactly.",
  reddit: "Write a single, concise, thoughtful comment for this Reddit post or comment. Be conversational and authentic using simple, clear language. Only output the final comment — no extra text, options, or formatting. IMPORTANT: You MUST write your response in the SAME LANGUAGE as the original post. If the post is in German, write in German. If in Spanish, write in Spanish. If in English, write in English. Match the language exactly.",
  twitter: "Write a single, concise, engaging comment for this Twitter/X post. Be conversational and authentic using simple, clear language. Keep it brief and relevant to the topic. Only output the final comment — no extra text, options, or formatting. IMPORTANT: You MUST write your response in the SAME LANGUAGE as the original post. If the post is in Japanese, write in Japanese. If in Russian, write in Russian. If in English, write in English. Match the language exactly."
};

// Load existing key, model, custom prompts, and platform settings
chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'customPrompts', 'endWithQuestion', 'commentLength', 'enabledPlatforms', 'commentTone'], (result) => {
  if (result.geminiApiKey) {
    document.getElementById('api-key').value = result.geminiApiKey;
    showKeyPreview(result.geminiApiKey);
  }
  // Set model mode picker and migrate older saved concrete model IDs.
  const selectedModelMode = normalizeModelMode(result.geminiModel);
  document.getElementById('model-picker').value = selectedModelMode;
  if (result.geminiModel && result.geminiModel !== selectedModelMode) {
    chrome.storage.sync.set({ geminiModel: selectedModelMode });
  }
  
  // Load custom prompts or use defaults
  const customPrompts = result.customPrompts || {};
  document.getElementById('linkedin-prompt').value = customPrompts.linkedin || defaultPrompts.linkedin;
  document.getElementById('producthunt-prompt').value = customPrompts.producthunt || defaultPrompts.producthunt;
  document.getElementById('reddit-prompt').value = customPrompts.reddit || defaultPrompts.reddit;
  document.getElementById('twitter-prompt').value = customPrompts.twitter || defaultPrompts.twitter;
  
  // Set end with question checkbox
  document.getElementById('end-with-question').checked = result.endWithQuestion || false;
  
  // Set comment length slider, default to 1 (medium)
  document.getElementById('length-slider').value = result.commentLength !== undefined ? result.commentLength : 1;
  
  // Set comment tone selector, default to 'none'
  document.getElementById('tone-selector').value = result.commentTone || 'none';
  
  // Load platform settings with defaults (LinkedIn and Product Hunt on, Twitter off)
  const enabledPlatforms = result.enabledPlatforms || {
    linkedin: true,
    twitter: false,
    producthunt: true,
    reddit: true
  };
  document.getElementById('platform-linkedin').checked = enabledPlatforms.linkedin !== false;
  document.getElementById('platform-twitter').checked = enabledPlatforms.twitter === true;
  document.getElementById('platform-producthunt').checked = enabledPlatforms.producthunt !== false;
  document.getElementById('platform-reddit').checked = enabledPlatforms.reddit !== false;
});

// Key preview is now handled in the auto-save listener above

// Show/hide API key functionality
const apiKeyInput = document.getElementById('api-key');
const toggleBtn = document.getElementById('toggle-key-visibility');
if (toggleBtn && apiKeyInput) {
  toggleBtn.addEventListener('click', function () {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleBtn.textContent = isPassword ? '🙈' : '👁️';
  });
}

function showKeyPreview(key) {
  const preview = document.getElementById('api-key-preview');
  const testBtn = document.getElementById('test-api-key');
  if (key && key.length > 8) {
    const first = key.slice(0, 4);
    const last = key.slice(-4);
    preview.textContent = `Current Key: ${first}...${last}`;
    testBtn.style.display = 'inline-block';
  } else if (key) {
    preview.textContent = 'Current Key: ' + '.'.repeat(Math.min(key.length, 5));
    testBtn.style.display = key.length > 0 ? 'inline-block' : 'none';
  } else {
    preview.textContent = '';
    testBtn.style.display = 'none';
  }
}

// Test API key function
async function testApiKey(key) {
  const testBtn = document.getElementById('test-api-key');
  const resultSpan = document.getElementById('test-result');
  
  // Show testing state
  testBtn.disabled = true;
  resultSpan.className = 'test-result testing';
  resultSpan.textContent = 'Testing...';
  
  try {
    const modelMode = normalizeModelMode(document.getElementById('model-picker').value);
    const response = await testApiKeyAgainstModels(key, MODEL_CHAINS[modelMode]);

    if (response.ok) {
      resultSpan.className = 'test-result success';
      resultSpan.textContent = '✓ Valid';
    } else {
      const error = await response.json();
      resultSpan.className = 'test-result error';
      if (response.status === 400 || response.status === 403) {
        resultSpan.textContent = '✗ Invalid key';
      } else {
        resultSpan.textContent = '✗ Error';
      }
    }
  } catch (err) {
    resultSpan.className = 'test-result error';
    resultSpan.textContent = '✗ Network error';
  } finally {
    testBtn.disabled = false;
    // Keep the result visible - don't clear it
  }
}

async function testApiKeyAgainstModels(key, models) {
  let lastResponse;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Test' }] }]
      })
    });

    if (response.ok) return response;
    lastResponse = response;
  }
  return lastResponse;
}

// Manual test button click
document.getElementById('test-api-key').addEventListener('click', function() {
  const key = document.getElementById('api-key').value.trim();
  if (key) {
    testApiKey(key);
  }
});

// Display version number
chrome.runtime.getManifest().version && (document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version);

// Rating functionality
document.addEventListener('DOMContentLoaded', function() {
  const stars = document.querySelectorAll('.star');
  let selectedRating = 0;
  
  // Load saved rating
  chrome.storage.sync.get(['userRating'], (result) => {
    if (result.userRating) {
      selectedRating = result.userRating;
      updateStars(selectedRating);
    }
  });
  
  stars.forEach(star => {
    star.addEventListener('mouseenter', function() {
      const rating = parseInt(this.getAttribute('data-value'));
      updateStars(rating, true);
    });
    
    star.addEventListener('mouseleave', function() {
      updateStars(selectedRating);
    });
    
    star.addEventListener('click', function() {
      selectedRating = parseInt(this.getAttribute('data-value'));
      updateStars(selectedRating);
      
      // Save rating
      chrome.storage.sync.set({ userRating: selectedRating });
      
      // If rating is 4 or 5, open Chrome Web Store
      if (selectedRating >= 4) {
        setTimeout(() => {
          window.open('https://chromewebstore.google.com/detail/butterfly/glnbimhldddbgjpoeohaogmhfmkfjbop', '_blank');
        }, 300);
      }
    });
  });
  
  function updateStars(rating, isHover = false) {
    stars.forEach((star, index) => {
      if (index < rating) {
        if (isHover) {
          star.classList.add('hover');
          star.classList.remove('selected');
        } else {
          star.classList.add('selected');
          star.classList.remove('hover');
        }
      } else {
        star.classList.remove('selected', 'hover');
      }
    });
  }
});

// Auto-save prompts with debouncing
let saveTimeout;
function autoSavePrompts() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const customPrompts = {
      linkedin: document.getElementById('linkedin-prompt').value,
      producthunt: document.getElementById('producthunt-prompt').value,
      reddit: document.getElementById('reddit-prompt').value,
      twitter: document.getElementById('twitter-prompt').value
    };
    chrome.storage.sync.set({ customPrompts });
  }, 500); // Debounce for 500ms
}

// Add auto-save listeners to all prompt textareas
document.getElementById('linkedin-prompt').addEventListener('input', function() {
  autoSavePrompts();
  checkModifiedPrompts();
});
document.getElementById('producthunt-prompt').addEventListener('input', function() {
  autoSavePrompts();
  checkModifiedPrompts();
});
document.getElementById('reddit-prompt').addEventListener('input', function() {
  autoSavePrompts();
  checkModifiedPrompts();
});
document.getElementById('twitter-prompt').addEventListener('input', function() {
  autoSavePrompts();
  checkModifiedPrompts();
});

// Auto-save end with question checkbox
document.getElementById('end-with-question').addEventListener('change', function() {
  chrome.storage.sync.set({ endWithQuestion: this.checked });
});

// Auto-save comment length slider
document.getElementById('length-slider').addEventListener('input', function() {
  chrome.storage.sync.set({ commentLength: parseInt(this.value) });
});

// Auto-save comment tone selector
document.getElementById('tone-selector').addEventListener('change', function() {
  chrome.storage.sync.set({ commentTone: this.value });
});

// Auto-save platform settings
function savePlatformSettings() {
  const enabledPlatforms = {
    linkedin: document.getElementById('platform-linkedin').checked,
    twitter: document.getElementById('platform-twitter').checked,
    producthunt: document.getElementById('platform-producthunt').checked,
    reddit: document.getElementById('platform-reddit').checked
  };
  chrome.storage.sync.set({ enabledPlatforms });
}

// Add listeners for platform checkboxes
document.getElementById('platform-linkedin').addEventListener('change', savePlatformSettings);
document.getElementById('platform-twitter').addEventListener('change', savePlatformSettings);
document.getElementById('platform-producthunt').addEventListener('change', savePlatformSettings);
document.getElementById('platform-reddit').addEventListener('change', savePlatformSettings);

// Reset prompt functionality
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('reset-prompt-btn')) {
    const platform = e.target.getAttribute('data-platform');
    const textarea = document.getElementById(platform + '-prompt');
    if (textarea && defaultPrompts[platform]) {
      textarea.value = defaultPrompts[platform];
      // Auto-save the reset prompt
      autoSavePrompts();
      // Check for modified prompts
      checkModifiedPrompts();
    }
  }
});

// Function to check if prompts are modified
function checkModifiedPrompts() {
  const platforms = ['linkedin', 'producthunt', 'reddit', 'twitter'];
  
  platforms.forEach(platform => {
    const textarea = document.getElementById(platform + '-prompt');
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${platform}"]`);
    const tabPane = document.getElementById('tab-' + platform);
    const resetBtn = tabPane.querySelector('.reset-prompt-btn');
    
    if (textarea && tabBtn && tabPane && resetBtn) {
      const currentValue = textarea.value.trim();
      const defaultValue = defaultPrompts[platform].trim();
      
      // Remove any existing indicator container
      const existingContainer = tabPane.querySelector('.modified-indicator-container');
      if (existingContainer) {
        existingContainer.remove();
      }
      
      if (currentValue !== defaultValue && currentValue !== '') {
        // Mark tab as modified
        tabBtn.classList.add('modified');
        
        // Create container for indicator and reset button
        const container = document.createElement('div');
        container.className = 'modified-indicator-container';
        
        // Add indicator text
        const indicator = document.createElement('span');
        indicator.className = 'modified-indicator';
        indicator.textContent = '⚠️ Custom prompt (differs from default)';
        container.appendChild(indicator);
        
        // Move reset button to the container
        resetBtn.style.display = 'inline-block';
        resetBtn.style.marginLeft = '10px';
        container.appendChild(resetBtn);
        
        tabPane.insertBefore(container, textarea);
      } else {
        // Remove modified class
        tabBtn.classList.remove('modified');
        // Hide reset button and put it back after textarea
        resetBtn.style.display = 'none';
        textarea.parentNode.insertBefore(resetBtn, textarea.nextSibling);
      }
    }
  });
}

// Tab functionality
document.addEventListener('DOMContentLoaded', function() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const targetTab = this.getAttribute('data-tab');
      
      // Remove active class from all tabs and panes
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding pane
      this.classList.add('active');
      document.getElementById('tab-' + targetTab).classList.add('active');
    });
  });
  
  // Check for modified prompts on load
  checkModifiedPrompts();
});
