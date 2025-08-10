// background.js - Handles Gemini API requests

// Load slop lists
let slopWords = [];
let slopBigrams = [];
let slopTrigrams = [];

async function loadSlopLists() {
  try {
    const [wordsResponse, bigramsResponse, trigramsResponse] = await Promise.all([
      fetch(chrome.runtime.getURL('slop_list.json')),
      fetch(chrome.runtime.getURL('slop_list_bigrams.json')),
      fetch(chrome.runtime.getURL('slop_list_trigrams.json'))
    ]);
    
    slopWords = (await wordsResponse.json()).flat();
    slopBigrams = (await bigramsResponse.json()).map(bigram => bigram.join(' '));
    slopTrigrams = (await trigramsResponse.json()).map(trigram => trigram.join(' '));
  } catch (error) {
    console.error('Failed to load slop lists:', error);
  }
}

// Load slop lists when extension starts
loadSlopLists();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GEMINI_SUGGEST') {
    const { site, postText, postAuthor, refinement, currentComment } = message; // Added site
    // Get API key, model, custom prompts, endWithQuestion, commentLength, tone, and platform settings from storage
    chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'customPrompts', 'endWithQuestion', 'commentLength', 'enabledPlatforms', 'commentTone'], (result) => {
      const apiKey = result.geminiApiKey;
      const model = result.geminiModel || 'gemini-2.5-flash';
      const customPrompts = result.customPrompts || {};
      const endWithQuestion = result.endWithQuestion || false;
      const commentLength = result.commentLength !== undefined ? result.commentLength : 1; // Default to medium
      const commentTone = result.commentTone || 'none';
      
      // Check if platform is enabled
      const enabledPlatforms = result.enabledPlatforms || {
        linkedin: true,
        twitter: false,
        producthunt: true
      };
      
      if (!enabledPlatforms[site]) {
        sendResponse({ suggestion: `Butterfly is disabled for ${site}. Enable it in extension settings.` });
        return;
      }
      
      if (!apiKey) {
        sendResponse({ error: 'No API key found. Please set your Gemini API key in extension settings.' });
        return;
      }
      // Pass model, customPrompts, endWithQuestion, commentLength, and commentTone to fetchGeminiSuggestion
      fetchGeminiSuggestions(site, postText, postAuthor, apiKey, model, refinement, currentComment, customPrompts, endWithQuestion, commentLength, commentTone)
        .then((suggestions) => {
          console.log('[Butterfly] Generated suggestions:', suggestions);
          if (!suggestions || suggestions.length === 0) {
            console.error('[Butterfly] No suggestions generated - API returned empty');
            sendResponse({ error: 'No suggestions generated. Please check your API key.' });
          } else {
            sendResponse({ suggestions });
          }
        })
        .catch((e) => {
          console.error('Gemini API error:', e);
          let errorMessage = 'Failed to generate comment';
          if (e && e.message) {
            errorMessage = e.message;
            // Check for common API key issues
            if (e.message.includes('API_KEY_INVALID') || e.message.includes('403')) {
              errorMessage = 'Invalid API key. Please check your Gemini API key in extension settings.';
            } else if (e.message.includes('QUOTA_EXCEEDED') || e.message.includes('429')) {
              errorMessage = 'API quota exceeded. Please try again later.';
            } else if (e.message.includes('400')) {
              errorMessage = 'Invalid request. Please try a different model or check your settings.';
            }
          }
          sendResponse({ error: errorMessage });
        });
    });
    return true; // Keep message channel open for async
  }
});

// Generate instruction to avoid slop words
function getSlopWordsInstruction() {
  if (slopWords.length === 0 && slopBigrams.length === 0 && slopTrigrams.length === 0) {
    return ''; // Return empty if lists haven't loaded yet
  }
  
  // Sample some words/phrases to include in the prompt (to keep it concise)
  const sampleWords = slopWords.slice(0, 30).join(', ');
  const sampleBigrams = slopBigrams.slice(0, 10).join(', ');
  const sampleTrigrams = slopTrigrams.slice(0, 10).join(', ');
  
  return `\n\nIMPORTANT: Avoid using overused or clichéd words and phrases. Specifically avoid words like: ${sampleWords}. Also avoid phrases like: ${sampleBigrams}. And avoid patterns like: ${sampleTrigrams}. Write in a natural, authentic voice without these overused AI-writing patterns.`;
}

// Update fetchGeminiSuggestion to accept model, customPrompts, endWithQuestion, commentLength, and commentTone
async function fetchGeminiSuggestion(site = 'linkedin', postText, postAuthor, apiKey, model = 'gemini-2.5-flash', refinement = '', currentComment = '', customPrompts = {}, endWithQuestion = false, commentLength = 1, commentTone = 'none') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  console.log('[Butterfly] Making API call with model:', model, 'for site:', site);
  
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
  
  // Add slop words avoidance instruction
  prompt += getSlopWordsInstruction();
  
  // Add tone instruction based on selector value
  const toneInstructions = {
    'none': '',
    'friendly': '\n\nIMPORTANT: Write in a warm, friendly, and approachable tone. Be personable and welcoming.',
    'professional': '\n\nIMPORTANT: Write in a formal, professional tone. Be polished and business-appropriate.',
    'casual': '\n\nIMPORTANT: Write in a casual, relaxed tone. Be informal and conversational, like talking to a friend.',
    'enthusiastic': '\n\nIMPORTANT: Write in an enthusiastic, energetic tone. Show genuine excitement and passion.',
    'thoughtful': '\n\nIMPORTANT: Write in a thoughtful, reflective tone. Be contemplative and show deep consideration.',
    'bold': '\n\nIMPORTANT: Write in a bold, confident tone. Be assertive and direct with strong opinions.',
    'provocative': '\n\nIMPORTANT: Write in a provocative, thought-provoking tone. Challenge assumptions and spark discussion.',
    'humorous': '\n\nIMPORTANT: Write in a light-hearted, humorous tone. Include wit or clever observations while staying respectful.',
    'empathetic': '\n\nIMPORTANT: Write in an empathetic, understanding tone. Show compassion and emotional intelligence.'
  };
  
  if (commentTone && commentTone !== 'none' && toneInstructions[commentTone]) {
    prompt += toneInstructions[commentTone];
  }
  
  // Add length instruction based on slider value
  const lengthInstructions = [
    '\n\nIMPORTANT: Keep the comment very brief and concise - maximum 1-2 sentences.',
    '', // Medium length - no additional instruction needed
    '\n\nIMPORTANT: Write a more detailed, thoughtful comment that is at least 3-4 sentences long. Provide more context and depth.'
  ];
  if (commentLength !== 1) { // Only add instruction if not medium
    prompt += lengthInstructions[commentLength];
  }
  
  // Add instruction to end with a question if enabled
  if (endWithQuestion) {
    prompt += '\n\nIMPORTANT: End your comment with a relevant, thoughtful question to encourage further discussion.';
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
    console.error('[Butterfly] Failed to parse API response:', e);
    throw new Error('Could not parse Gemini API response');
  }
  if (!res.ok) {
    console.error('[Butterfly] API error response:', JSON.stringify(data, null, 2));
    let errorMessage = 'HTTP ' + res.status;
    if (data && data.error) {
      if (typeof data.error === 'string') {
        errorMessage = data.error;
      } else if (data.error.message) {
        errorMessage = data.error.message;
      } else if (data.error.code) {
        errorMessage = `Error code: ${data.error.code}`;
      }
    }
    throw new Error(errorMessage);
  }
  const suggestion = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('[Butterfly] Single suggestion generated:', suggestion ? 'Success' : 'Empty');
  return suggestion;
}

// Generate multiple suggestions
async function fetchGeminiSuggestions(site = 'linkedin', postText, postAuthor, apiKey, model = 'gemini-2.5-flash', refinement = '', currentComment = '', customPrompts = {}, endWithQuestion = false, commentLength = 1, commentTone = 'none') {
  // Generate 4 variants in parallel
  const promises = [];
  for (let i = 0; i < 4; i++) {
    promises.push(
      fetchGeminiSuggestion(site, postText, postAuthor, apiKey, model, refinement, currentComment, customPrompts, endWithQuestion, commentLength, commentTone)
        .catch(err => '') // If one fails, return empty string
    );
  }
  
  const suggestions = await Promise.all(promises);
  // Filter out empty suggestions and ensure uniqueness
  const uniqueSuggestions = [...new Set(suggestions.filter(s => s && s.trim()))];
  
  // If we don't have enough unique suggestions, try to generate more
  while (uniqueSuggestions.length < 4 && uniqueSuggestions.length > 0) {
    const newSuggestion = await fetchGeminiSuggestion(site, postText, postAuthor, apiKey, model, refinement, currentComment, customPrompts, endWithQuestion, commentLength)
      .catch(err => '');
    if (newSuggestion && !uniqueSuggestions.includes(newSuggestion)) {
      uniqueSuggestions.push(newSuggestion);
    }
    // Prevent infinite loop
    if (uniqueSuggestions.length === 1) {
      // If we can only get one unique suggestion, duplicate it for now
      break;
    }
  }
  
  return uniqueSuggestions;
}
