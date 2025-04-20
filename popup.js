// popup.js - Save Gemini API key

document.getElementById('save-btn').onclick = function () {
  const key = document.getElementById('api-key').value.trim();
  const model = document.getElementById('model-picker').value;
  chrome.storage.sync.set({ geminiApiKey: key, geminiModel: model }, () => {
    document.getElementById('status').textContent = 'Saved!';
    setTimeout(() => { document.getElementById('status').textContent = ''; }, 1500);
    showKeyPreview(key);
  });
};

// Load existing key and model
chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
  if (result.geminiApiKey) {
    document.getElementById('api-key').value = result.geminiApiKey;
    showKeyPreview(result.geminiApiKey);
  }
  // Set model picker, default to gemini-2.0-flash
  document.getElementById('model-picker').value = result.geminiModel || 'gemini-2.0-flash';
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
