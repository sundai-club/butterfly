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
    
    // Each item in slop_list.json is an array with a single word, so we need to flatten twice
    const wordsData = await wordsResponse.json();
    slopWords = wordsData.map(arr => arr[0]); // Extract the first element from each sub-array
    
    const bigramsData = await bigramsResponse.json();
    slopBigrams = bigramsData.map(bigram => bigram.join(' '));
    
    const trigramsData = await trigramsResponse.json();
    slopTrigrams = trigramsData.map(trigram => trigram.join(' '));
    
    console.log('[Butterfly] Loaded slop lists:', {
      words: slopWords.length,
      bigrams: slopBigrams.length,
      trigrams: slopTrigrams.length
    });
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
      const model = result.geminiModel || 'gemini-2.5-flash-lite';
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
        .then((result) => {
          console.log('[Butterfly] Generated result:', result);
          if (!result || !result.suggestions || result.suggestions.length === 0) {
            console.error('[Butterfly] No suggestions generated - API returned empty');
            sendResponse({ error: 'No suggestions generated. Please check your API key.' });
          } else {
            sendResponse({ suggestions: result.suggestions, debugPrompt: result.debugPrompt });
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
    console.log('[Butterfly] Slop lists not loaded yet');
    return ''; // Return empty if lists haven't loaded yet
  }
  
  console.log('[Butterfly] Adding slop words instruction with:', {
    words: slopWords.length,
    bigrams: slopBigrams.length,
    trigrams: slopTrigrams.length
  });
  
  // Include ALL words/phrases in the prompt
  const allWords = slopWords.join(', ');
  const allBigrams = slopBigrams.join(', ');
  const allTrigrams = slopTrigrams.join(', ');
  
  let instruction = '\n\nIMPORTANT: Avoid using ANY of these overused or clichéd words and phrases. Write in a natural, authentic voice using simple, clear language without these AI-writing patterns.';
  
  if (slopWords.length > 0) {
    instruction += `\n\nForbidden single words: ${allWords}`;
  }
  
  if (slopBigrams.length > 0) {
    instruction += `\n\nForbidden two-word phrases: ${allBigrams}`;
  }
  
  if (slopTrigrams.length > 0) {
    instruction += `\n\nForbidden three-word phrases: ${allTrigrams}`;
  }
  
  return instruction;
}

// Wrapper to capture debug info
let lastDebugPrompt = '';

// Update fetchGeminiSuggestion to accept model, customPrompts, endWithQuestion, commentLength, and commentTone
async function fetchGeminiSuggestion(site = 'linkedin', postText, postAuthor, apiKey, model = 'gemini-2.5-flash-lite', refinement = '', currentComment = '', customPrompts = {}, endWithQuestion = false, commentLength = 1, commentTone = 'none') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  console.log('[Butterfly] Making API call with model:', model, 'for site:', site);
  
  // Prompt structure: Author, Post, (optional) Current Comment, (optional) Refinement, then instruction
  let prompt = `[POST-AUTHOR]
${postAuthor}
[/POST-AUTHOR]

[POST-CONTENT]
${postText}
[/POST-CONTENT]`;
  
  if (currentComment && currentComment.trim()) {
    prompt += `\n\n[CURRENT-COMMENT]
${currentComment}
[/CURRENT-COMMENT]`;
  }
  if (refinement && refinement.trim()) {
    prompt += `\n\n[REFINEMENT-INSTRUCTIONS]
${refinement}
[/REFINEMENT-INSTRUCTIONS]`;
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
    'excited': '\n\nIMPORTANT: Write in an enthusiastic, energetic tone. Show genuine excitement and passion.',
    'thoughtful': '\n\nIMPORTANT: Write in a thoughtful, reflective tone. Be contemplative and show deep consideration.',
    'bold': '\n\nIMPORTANT: Write in a bold, confident tone. Be assertive and direct with strong opinions.',
    'provocative': '\n\nIMPORTANT: Write in a provocative, thought-provoking tone. Challenge assumptions and spark discussion.',
    'funny': '\n\nIMPORTANT: Write in a light-hearted, humorous tone. Include wit or clever observations while staying respectful.',
    'empathetic': '\n\nIMPORTANT: Write in an empathetic, understanding tone. Show compassion and emotional intelligence.',
    'doomed': '\n\nIMPORTANT: Write in a pessimistic, doom-and-gloom tone. Express skepticism about outcomes and highlight potential problems or inevitable failures. Be cynical but articulate.',
    'direct': '\n\nIMPORTANT: Be direct and concise. Use short, clear sentences with strong verbs. No hedging words (maybe, perhaps, might). Get straight to the point without fluff or filler.',
    'pushback': '\n\nIMPORTANT: Acknowledge one good point from the post, then respectfully challenge one assumption or aspect. Offer a constructive alternative or fix. Be friendly but thought-provoking.',
    'socratic': '\n\nIMPORTANT: Ask 2-3 sharp, thought-provoking questions that dig deeper into the topic. Questions should expose hidden assumptions or unexplored angles. End with suggesting a concrete next step.',
    'builder': '\n\nIMPORTANT: Focus on action and building. State a clear outcome or goal, list 2-3 concrete steps to achieve it, and give a specific deadline or timeframe. Be motivating and results-oriented.',
    'challenger': '\n\nIMPORTANT: Set a high bar or ambitious challenge. Be crisp and bold. State what excellence looks like, set a specific date or metric, and inspire action. No wasted words.'
  };
  
  if (commentTone && commentTone !== 'none' && toneInstructions[commentTone]) {
    prompt += toneInstructions[commentTone];
  }
  
  // Add length instruction based on slider value
  const lengthInstructions = [
    '\n\nCRITICAL: Keep the comment very brief and concise - maximum very short 1 sentence.',
    '', // Medium length - no additional instruction needed
    '\n\nCRITICAL: Write a more detailed, thoughtful comment that is at least 3-4 sentences long. Provide more context and depth.'
  ];
  if (commentLength !== 1) { // Only add instruction if not medium
    prompt += lengthInstructions[commentLength];
  }
  
  // Add instruction to end with a question if enabled
  if (endWithQuestion) {
    prompt += '\n\nIMPORTANT: End your comment with a relevant, thoughtful question to encourage further discussion.';
  }
  
  // Log the full prompt for debugging
  console.log('[Butterfly] Executing prompt:', prompt);
  lastDebugPrompt = prompt; // Store for debugging
  
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

// Generate multiple suggestions in a single API call
async function fetchGeminiSuggestions(site = 'linkedin', postText, postAuthor, apiKey, model = 'gemini-2.5-flash-lite', refinement = '', currentComment = '', customPrompts = {}, endWithQuestion = false, commentLength = 1, commentTone = 'none') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  console.log('[Butterfly] Making single API call for 4 variants with model:', model, 'for site:', site);
  
  // Build the base prompt structure
  let basePrompt = `[POST-AUTHOR]
${postAuthor}
[/POST-AUTHOR]

[POST-CONTENT]
${postText}
[/POST-CONTENT]`;
  
  if (currentComment && currentComment.trim()) {
    basePrompt += `\n\n[CURRENT-COMMENT]
${currentComment}
[/CURRENT-COMMENT]`;
  }
  if (refinement && refinement.trim()) {
    basePrompt += `\n\n[REFINEMENT-INSTRUCTIONS]
${refinement}
[/REFINEMENT-INSTRUCTIONS]`;
  }

  // Add the main instruction
  const customPrompt = customPrompts[site];
  let mainInstruction = '';
  
  if (customPrompt && customPrompt.trim()) {
    mainInstruction = customPrompt;
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
        mainInstruction = `Refine the current comment for this Product Hunt post based on the refinement instructions. Focus on being supportive, insightful, or asking a relevant question. ${authorReference}`;
      } else {
        mainInstruction = `Write comments for this Product Hunt post. Each comment should be supportive of the product and its creator(s). ${authorReference} Comments could highlight cool features, ask questions, or express excitement. If appropriate and known, mention the product name or the creator's name.`;
      }
    } else if (site === 'twitter') {
      if (currentComment && currentComment.trim()) {
        mainInstruction = `Refine the current comment for this Twitter/X post based on the refinement instructions. Keep it conversational and authentic.`;
      } else {
        mainInstruction = `Write comments for this Twitter/X post. Be conversational and authentic. Keep them brief and relevant to the topic.`;
      }
    } else { // Default to LinkedIn
      if (currentComment && currentComment.trim()) {
        mainInstruction = `Refine the current comment based on refinement instructions, keeping it as a congratulatory comment for this LinkedIn post. Include author's name in the comment.`;
      } else {
        mainInstruction = `Write professional congratulatory comments for this LinkedIn post. Include author's name in the comments.`;
      }
    }
  }

  // Build the full prompt requesting 4 variants
  let prompt = basePrompt + '\n\n' + mainInstruction;
  prompt += '\n\nIMPORTANT: Generate exactly 4 different comment variants. Each should be unique and varied in style while following the instructions. Format your response as a numbered list:\n1. [first comment]\n2. [second comment]\n3. [third comment]\n4. [fourth comment]';
  
  // Add slop words avoidance
  prompt += getSlopWordsInstruction();
  
  // Add tone instruction
  const toneInstructions = {
    'none': '',
    'friendly': '\n\nIMPORTANT: Write in a warm, friendly, and approachable tone. Be personable and welcoming.',
    'excited': '\n\nIMPORTANT: Write in an enthusiastic, energetic tone. Show genuine excitement and passion.',
    'thoughtful': '\n\nIMPORTANT: Write in a thoughtful, reflective tone. Be contemplative and show deep consideration.',
    'bold': '\n\nIMPORTANT: Write in a bold, confident tone. Be assertive and direct with strong opinions.',
    'provocative': '\n\nIMPORTANT: Write in a provocative, thought-provoking tone. Challenge assumptions and spark discussion.',
    'funny': '\n\nIMPORTANT: Write in a light-hearted, humorous tone. Include wit or clever observations while staying respectful.',
    'empathetic': '\n\nIMPORTANT: Write in an empathetic, understanding tone. Show compassion and emotional intelligence.',
    'doomed': '\n\nIMPORTANT: Write in a pessimistic, doom-and-gloom tone. Express skepticism about outcomes and highlight potential problems or inevitable failures. Be cynical but articulate.',
    'direct': '\n\nIMPORTANT: Be direct and concise. Use short, clear sentences with strong verbs. No hedging words (maybe, perhaps, might). Get straight to the point without fluff or filler.',
    'pushback': '\n\nIMPORTANT: Acknowledge one good point from the post, then respectfully challenge one assumption or aspect. Offer a constructive alternative or fix. Be friendly but thought-provoking.',
    'socratic': '\n\nIMPORTANT: Ask 2-3 sharp, thought-provoking questions that dig deeper into the topic. Questions should expose hidden assumptions or unexplored angles. End with suggesting a concrete next step.',
    'builder': '\n\nIMPORTANT: Focus on action and building. State a clear outcome or goal, list 2-3 concrete steps to achieve it, and give a specific deadline or timeframe. Be motivating and results-oriented.',
    'challenger': '\n\nIMPORTANT: Set a high bar or ambitious challenge. Be crisp and bold. State what excellence looks like, set a specific date or metric, and inspire action. No wasted words.'
  };
  
  if (commentTone && commentTone !== 'none' && toneInstructions[commentTone]) {
    prompt += toneInstructions[commentTone];
  }
  
  // Add length instruction
  const lengthInstructions = [
    '\n\nVERY IMPORTANT: Keep each comment very brief and extra concise - maximum very short 1 sentence.',
    '', // Medium length - no additional instruction needed
    '\n\nVERY IMPORTANT: Write more detailed, thoughtful comments that are at least 3-4 sentences long each. Provide more context and depth.'
  ];
  if (commentLength !== 1) {
    prompt += lengthInstructions[commentLength];
  }
  
  // Add question instruction
  if (endWithQuestion) {
    prompt += '\n\nIMPORTANT: End each comment with a relevant, thoughtful, tone and style-appropriate question to encourage further discussion.';
  }
  
  // Log the full prompt for debugging
  console.log('[Butterfly] Executing prompt for 4 variants:', prompt);
  lastDebugPrompt = prompt;
  
  try {
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
    
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Butterfly] API response received, parsing variants');
    
    // Parse the numbered list response
    const suggestions = [];
    const lines = responseText.split('\n');
    
    for (const line of lines) {
      // Match lines that start with a number followed by period or parenthesis
      const match = line.match(/^\d+[\.\)]\s*(.+)/);
      if (match && match[1]) {
        const suggestion = match[1].trim();
        if (suggestion && !suggestions.includes(suggestion)) {
          suggestions.push(suggestion);
        }
      }
    }
    
    // If we couldn't parse numbered format, try splitting by double newlines as fallback
    if (suggestions.length === 0) {
      const parts = responseText.split(/\n\n+/).filter(s => s.trim());
      for (const part of parts) {
        // Remove any numbering at the start
        const cleaned = part.replace(/^\d+[\.\)]\s*/, '').trim();
        if (cleaned && !suggestions.includes(cleaned)) {
          suggestions.push(cleaned);
        }
      }
    }
    
    console.log('[Butterfly] Parsed', suggestions.length, 'suggestions from response');
    console.log('[Butterfly] Returning suggestions object:', { suggestions, debugPrompt: lastDebugPrompt });
    return { suggestions, debugPrompt: lastDebugPrompt };
    
  } catch (error) {
    console.error('[Butterfly] Error generating suggestions:', error);
    throw error;
  }
}
