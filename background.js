// background.js - Handles Gemini API requests

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GEMINI_SUGGEST') {
    const { site, postText, postAuthor, refinement, currentComment } = message; // Added site
    // Get API key, model, and custom prompts from storage
    chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'customPrompts'], (result) => {
      const apiKey = result.geminiApiKey;
      const model = result.geminiModel || 'gemini-2.5-flash';
      const customPrompts = result.customPrompts || {};
      if (!apiKey) {
        sendResponse({ suggestion: 'Set Gemini API key in extension settings.' });
        return;
      }
      // Pass model and customPrompts to fetchGeminiSuggestion
      fetchGeminiSuggestion(site, postText, postAuthor, apiKey, model, refinement, currentComment, customPrompts)
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

// Update fetchGeminiSuggestion to accept model and customPrompts
async function fetchGeminiSuggestion(site = 'linkedin', postText, postAuthor, apiKey, model = 'gemini-2.5-flash', refinement = '', currentComment = '', customPrompts = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  // Prompt structure: Author, Post, (optional) Current Comment, (optional) Refinement, then instruction
  let prompt = `Post author: "${postAuthor}"
Post content: "${postText}"`;
  
  if (currentComment && currentComment.trim()) {
    prompt += `\nCurrent comment: ${currentComment}`;
  }
  if (refinement && refinement.trim()) {
    prompt += `\nRefinement instructions: ${refinement}`;
  }

  // Use custom prompt if available, otherwise fall back to default logic
  const customPrompt = customPrompts[site];
  if (customPrompt && customPrompt.trim()) {
    prompt += `\n\n${customPrompt}`;
  } else {
    // Original platform-specific logic as fallback
    if (site === 'producthunt') {
      let authorReference = '';
      if (postAuthor && postAuthor.toLowerCase() !== 'maker' && postAuthor.trim() !== '') {
        authorReference = `The creator's name is '${postAuthor}'. You can refer to them by this name.`;
      } else {
        authorReference = `The creator's name was not identified; refer to them as 'the team', 'the creators', or 'the developers'. Do NOT use the word 'Maker' as a generic noun and do not invent a name.`;
      }

      if (currentComment && currentComment.trim()) {
        prompt += `\n\nRefine the current comment for this Product Hunt post based on the refinement instructions. Focus on being supportive, insightful, or asking a relevant question. ${authorReference} Only output the final refined comment — no extra text, options, or formatting.`;
      } else {
        prompt += `\n\nWrite a single, concise, and engaging comment for this Product Hunt post. The comment should be supportive of the product and its creator(s). ${authorReference} The comment could highlight a cool feature, ask a question, or express excitement. Only output the final comment — no extra text, options, or formatting. If appropriate and known, mention the product name or the creator's name.`;
      }
    } else if (site === 'twitter') {
      if (currentComment && currentComment.trim()) {
        prompt += `\n\nRefine the current comment for this Twitter/X post based on the refinement instructions. Keep it conversational and authentic. Only output the final refined comment — no extra text, options, or formatting.`;
      } else {
        prompt += `\n\nWrite a single, concise, engaging comment for this Twitter/X post. Be conversational and authentic. Keep it brief and relevant to the topic. Only output the final comment — no extra text, options, or formatting.`;
      }
    } else { // Default to LinkedIn
      if (currentComment && currentComment.trim()) {
        prompt += `\n\nRefine the current comment based on refinement instructions, keeping it as a congratulatory comment for this LinkedIn post. Only output the final comment — do not include options, explanations, formatting, or any extra text.`;
      } else {
        prompt += `\n\nWrite a single, concise, professional congratulatory comment for this LinkedIn post. Only output the final comment — do not include options, explanations, formatting, or any extra text. Include author's name in the comment.`;
      }
    }
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
