// background.js - Handles Gemini API requests

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GEMINI_SUGGEST') {
    const { postText, postAuthor, refinement } = message;
    // Get API key from storage
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      const apiKey = result.geminiApiKey;
      if (!apiKey) {
        sendResponse({ suggestion: 'Set Gemini API key in extension settings.' });
        return;
      }
      // Call async function outside of the callback, use .then/.catch
      fetchGeminiSuggestion(postText, postAuthor, apiKey, refinement)
        .then((suggestion) => {
          sendResponse({ suggestion });
        })
        .catch((e) => {
          console.error('Gemini API error:', e);
          sendResponse({ suggestion: 'Gemini API error: ' + (e && e.message ? e.message : e) });
        });
    });
    return true; // Keep message channel open for async
  }
});

// Update fetchGeminiSuggestion to accept refinement
async function fetchGeminiSuggestion(postText, postAuthor, apiKey, refinement = '') {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  // Updated prompt to return only the final, professional comment
  let prompt = `Write a single, concise, professional congratulatory comment for this LinkedIn post. Only output the final comment—do not include options, explanations, formatting,or any extra text. Include author's name to the comment. Author: "${postAuthor}". Post: "${postText}"`;
  if (refinement && refinement.trim()) {
    prompt += `\n\nRefinement instructions: ${refinement}`;
  }
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }]
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('Could not parse Gemini API response');
  }
  if (!res.ok) {
    throw new Error((data && data.error && data.error.message) ? data.error.message : 'HTTP ' + res.status);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
