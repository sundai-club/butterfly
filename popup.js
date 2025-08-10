// popup.js - Auto-save Gemini API key and model

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

// Auto-save model selection
document.getElementById('model-picker').addEventListener('change', function() {
  chrome.storage.sync.set({ geminiModel: this.value });
});

// Default prompts for each platform
const defaultPrompts = {
  linkedin: "Write a single, concise, professional congratulatory comment for this LinkedIn post. Avoid overused or clichéd phrases - write in a natural, authentic voice. Only output the final comment — do not include options, explanations, formatting, or any extra text. Include author's name in the comment.",
  producthunt: "Write a single, concise, and engaging comment for this Product Hunt post. The comment should be supportive of the product and its creator(s). Avoid overused or clichéd phrases - write in a natural, authentic voice. The comment could highlight a cool feature, ask a question, or express excitement. Only output the final comment — no extra text, options, or formatting. If appropriate and known, mention the product name or the creator's name.",
  twitter: "Write a single, concise, engaging comment for this Twitter/X post. Be conversational and authentic. Avoid overused or clichéd phrases. Keep it brief and relevant to the topic. Only output the final comment — no extra text, options, or formatting."
};

// Load existing key, model, custom prompts, and platform settings
chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'customPrompts', 'endWithQuestion', 'commentLength', 'enabledPlatforms'], (result) => {
  if (result.geminiApiKey) {
    document.getElementById('api-key').value = result.geminiApiKey;
    showKeyPreview(result.geminiApiKey);
  }
  // Set model picker, default to gemini-2.5-flash
  document.getElementById('model-picker').value = result.geminiModel || 'gemini-2.5-flash';
  
  // Load custom prompts or use defaults
  const customPrompts = result.customPrompts || {};
  document.getElementById('linkedin-prompt').value = customPrompts.linkedin || defaultPrompts.linkedin;
  document.getElementById('producthunt-prompt').value = customPrompts.producthunt || defaultPrompts.producthunt;
  document.getElementById('twitter-prompt').value = customPrompts.twitter || defaultPrompts.twitter;
  
  // Set end with question checkbox
  document.getElementById('end-with-question').checked = result.endWithQuestion || false;
  
  // Set comment length slider, default to 1 (medium)
  document.getElementById('length-slider').value = result.commentLength !== undefined ? result.commentLength : 1;
  
  // Load platform settings with defaults (LinkedIn and Product Hunt on, Twitter off)
  const enabledPlatforms = result.enabledPlatforms || {
    linkedin: true,
    twitter: false,
    producthunt: true
  };
  document.getElementById('platform-linkedin').checked = enabledPlatforms.linkedin !== false;
  document.getElementById('platform-twitter').checked = enabledPlatforms.twitter === true;
  document.getElementById('platform-producthunt').checked = enabledPlatforms.producthunt !== false;
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
    const model = document.getElementById('model-picker').value || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Test' }] }]
      })
    });
    
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
    // Clear result after 5 seconds
    setTimeout(() => {
      resultSpan.textContent = '';
      resultSpan.className = 'test-result';
    }, 5000);
  }
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
      twitter: document.getElementById('twitter-prompt').value
    };
    chrome.storage.sync.set({ customPrompts });
  }, 500); // Debounce for 500ms
}

// Add auto-save listeners to all prompt textareas
document.getElementById('linkedin-prompt').addEventListener('input', autoSavePrompts);
document.getElementById('producthunt-prompt').addEventListener('input', autoSavePrompts);
document.getElementById('twitter-prompt').addEventListener('input', autoSavePrompts);

// Auto-save end with question checkbox
document.getElementById('end-with-question').addEventListener('change', function() {
  chrome.storage.sync.set({ endWithQuestion: this.checked });
});

// Auto-save comment length slider
document.getElementById('length-slider').addEventListener('input', function() {
  chrome.storage.sync.set({ commentLength: parseInt(this.value) });
});

// Auto-save platform settings
function savePlatformSettings() {
  const enabledPlatforms = {
    linkedin: document.getElementById('platform-linkedin').checked,
    twitter: document.getElementById('platform-twitter').checked,
    producthunt: document.getElementById('platform-producthunt').checked
  };
  chrome.storage.sync.set({ enabledPlatforms });
}

// Add listeners for platform checkboxes
document.getElementById('platform-linkedin').addEventListener('change', savePlatformSettings);
document.getElementById('platform-twitter').addEventListener('change', savePlatformSettings);
document.getElementById('platform-producthunt').addEventListener('change', savePlatformSettings);

// Reset prompt functionality
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('reset-prompt-btn')) {
    const platform = e.target.getAttribute('data-platform');
    const textarea = document.getElementById(platform + '-prompt');
    if (textarea && defaultPrompts[platform]) {
      textarea.value = defaultPrompts[platform];
    }
  }
});

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
});
