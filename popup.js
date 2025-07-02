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

// Load existing key and model
chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
  if (result.geminiApiKey) {
    document.getElementById('api-key').value = result.geminiApiKey;
    showKeyPreview(result.geminiApiKey);
  }
  // Set model picker, default to gemini-2.5-flash
  document.getElementById('model-picker').value = result.geminiModel || 'gemini-2.5-flash';
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
    const stars = '.'.repeat(key.length - 8);
    preview.textContent = `Current Key: ${first}${stars}${last}`;
  } else if (key) {
    preview.textContent = 'Current Key: ' + '.'.repeat(key.length);
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
