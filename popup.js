// popup.js - Save Gemini API key

document.getElementById('save-btn').onclick = function () {
  const key = document.getElementById('api-key').value.trim();
  const model = document.getElementById('model-picker').value;
  chrome.storage.sync.set({ geminiApiKey: key, geminiModel: model }, () => {
    document.getElementById('save-btn').textContent = 'Saved!';
    setTimeout(() => { document.getElementById('save-btn').textContent = 'Save'; }, 1500);
    showKeyPreview(key);
  });
};

// Default prompts for each platform
const defaultPrompts = {
  linkedin: "Write a single, concise, professional congratulatory comment for this LinkedIn post. Only output the final comment — do not include options, explanations, formatting, or any extra text. Include author's name in the comment.",
  producthunt: "Write a single, concise, and engaging comment for this Product Hunt post. The comment should be supportive of the product and its creator(s). The comment could highlight a cool feature, ask a question, or express excitement. Only output the final comment — no extra text, options, or formatting. If appropriate and known, mention the product name or the creator's name.",
  twitter: "Write a single, concise, engaging comment for this Twitter/X post. Be conversational and authentic. Keep it brief and relevant to the topic. Only output the final comment — no extra text, options, or formatting."
};

// Load existing key, model, and custom prompts
chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'customPrompts'], (result) => {
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
});

document.getElementById('api-key').addEventListener('input', function () {
  showKeyPreview(this.value.trim());
});

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
  if (key && key.length > 8) {
    const first = key.slice(0, 4);
    const last = key.slice(-4);
    preview.textContent = `Current Key: ${first}...${last}`;
  } else if (key) {
    preview.textContent = 'Current Key: ' + '.'.repeat(Math.min(key.length, 5));
  } else {
    preview.textContent = '';
  }
}

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

// Save prompts functionality
document.getElementById('save-prompts-btn').addEventListener('click', function() {
  const customPrompts = {
    linkedin: document.getElementById('linkedin-prompt').value,
    producthunt: document.getElementById('producthunt-prompt').value,
    twitter: document.getElementById('twitter-prompt').value
  };
  
  chrome.storage.sync.set({ customPrompts }, () => {
    const originalText = this.textContent;
    this.textContent = 'Saved!';
    this.style.background = 'var(--button-bg-alt)';
    
    setTimeout(() => {
      this.textContent = originalText;
      this.style.background = '';
    }, 1500);
  });
});

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
