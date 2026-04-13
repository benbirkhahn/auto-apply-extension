// background.js — Service Worker for AutoApply extension

'use strict';

// ─── Installation ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      aiMode: true,
      fillHistory: [],
      profile: null
    });
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_AI_CONTENT') {
    generateAIContent(message.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (message.type === 'EVALUATE_JOBS') {
    evaluateJobBatch(message.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (message.type === 'LOG_FILL') {
    logFillEvent(message.payload);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    chrome.storage.local.get('fillHistory', ({ fillHistory }) => {
      sendResponse({ history: fillHistory || [] });
    });
    return true;
  }
});

// ─── AI Content Generation ─────────────────────────────────────────────────

async function generateAIContent({ profile, jobDescription, jobTitle, company }) {
  const { aiSettings } = await chrome.storage.local.get('aiSettings');
  const provider = aiSettings?.provider || 'claude';
  
  const keyMap = {
    claude: 'apiKeyClaude',
    openai: 'apiKeyOpenAI',
    gemini: 'apiKeyGemini'
  };
  
  const { [keyMap[provider]]: apiKey } = await chrome.storage.local.get(keyMap[provider]);
  if (!apiKey) throw new Error(`No API key for ${provider}. Configure it in the extension settings.`);

  const prompt = buildPrompt(profile, jobDescription, jobTitle, company);

  if (provider === 'claude') {
    return generateClaude(apiKey, prompt);
  } else if (provider === 'openai') {
    return generateOpenAI(apiKey, prompt);
  } else if (provider === 'gemini') {
    return generateGemini(apiKey, prompt);
  }
}

async function evaluateJobBatch({ profile, jobs }) {
  const { aiSettings } = await chrome.storage.local.get('aiSettings');
  const provider = aiSettings?.provider || 'claude';
  
  const keyMap = {
    claude: 'apiKeyClaude',
    openai: 'apiKeyOpenAI',
    gemini: 'apiKeyGemini'
  };
  
  const { [keyMap[provider]]: apiKey } = await chrome.storage.local.get(keyMap[provider]);
  if (!apiKey) throw new Error(`No API key for ${provider}. Configure it in the extension settings.`);

  const prompt = buildJobBatchPrompt(profile, jobs);

  if (provider === 'claude') {
    return generateClaude(apiKey, prompt);
  } else if (provider === 'openai') {
    return generateOpenAI(apiKey, prompt);
  } else if (provider === 'gemini') {
    return generateGemini(apiKey, prompt);
  }
}

async function generateClaude(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  return parseAIJSON(text);
}

async function generateOpenAI(apiKey, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseAIJSON(text);
}

async function generateGemini(apiKey, prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseAIJSON(text);
}

function parseAIJSON(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response format');
  return JSON.parse(jsonMatch[0]);
}

function buildPrompt(profile, jobDescription, jobTitle, company) {
  const workHistory = (profile.workHistory || [])
    .map(w => `- ${w.title} at ${w.company} (${w.startDate} – ${w.endDate || 'Present'}): ${w.description}`)
    .join('\n');

  const education = (profile.education || [])
    .map(e => `- ${e.degree} in ${e.field} from ${e.school} (${e.year})`)
    .join('\n');

  const projects = (profile.projects || [])
    .map(p => `- ${p.name}${p.technologies ? ' (' + p.technologies + ')' : ''}: ${p.description}${p.url ? ' — ' + p.url : ''}`)
    .join('\n');

  return `You are a professional job application assistant. Generate tailored content for a job application.

APPLICANT PROFILE:
Name: ${profile.firstName} ${profile.lastName}
Current Title: ${profile.title || 'N/A'}
Years of Experience: ${profile.yearsExperience || 'N/A'}
Skills: ${(profile.skills || []).join(', ')}
Summary: ${profile.summary || 'N/A'}

Work History:
${workHistory || 'N/A'}

Projects:
${projects || 'N/A'}

Education:
${education || 'N/A'}

JOB DETAILS:
Title: ${jobTitle || 'N/A'}
Company: ${company || 'N/A'}
Description: ${jobDescription ? jobDescription.substring(0, 2000) : 'N/A'}

Generate a JSON response with this exact structure (no markdown, just the JSON):
{
  "coverLetter": "A compelling 3-paragraph cover letter tailored to this specific role at ${company || 'this company'}. Reference the company by name. Be specific about why this company, highlight the most relevant experience and projects, and avoid generic phrases.",
  "whyCompany": "2-3 sentences specifically about why you want to work at ${company || 'this company'} — reference something real from the job description or what the company does. Write in first person. Do NOT be generic.",
  "whyRole": "2-3 sentences on why you are the right fit for this specific ${jobTitle || 'role'} — connect your background and projects directly to the role requirements.",
  "greatestStrength": "1-2 sentences about your greatest professional strength most relevant to this role, with a concrete example.",
  "growthArea": "1-2 sentences about an honest growth area, framed constructively and showing self-awareness.",
  "contribution": "2-3 sentences on the unique value you would bring to ${company || 'this team'}, grounded in your actual experience and projects."
}`;
}

function buildJobBatchPrompt(profile, jobs) {
  const workHistory = (profile.workHistory || [])
    .map(w => `- ${w.title} at ${w.company} (${w.startDate} – ${w.endDate || 'Present'}): ${w.description}`)
    .join('\n');

  const education = (profile.education || [])
    .map(e => `- ${e.degree} in ${e.field} from ${e.school} (${e.year})`)
    .join('\n');

  const projects = (profile.projects || [])
    .map(p => `- ${p.name}${p.technologies ? ' (' + p.technologies + ')' : ''}: ${p.description}`)
    .join('\n');

  const jobsList = jobs.map((j, i) => `[Job ${i}] Title: ${j.title || 'N/A'}, Company: ${j.company || 'N/A'}, Description: ${j.description || 'N/A'}`).join('\n\n');

  return `You are a professional career coach evaluating a list of jobs based on an applicant's profile.

APPLICANT PROFILE:
Name: ${profile.firstName} ${profile.lastName}
Current Title: ${profile.title || 'N/A'}
Years of Experience: ${profile.yearsExperience || 'N/A'}
Skills: ${(profile.skills || []).join(', ')}

Work History:
${workHistory || 'N/A'}

Projects:
${projects || 'N/A'}

Education:
${education || 'N/A'}

JOBS TO EVALUATE:
${jobsList}

Evaluate each job's fit for this applicant (score 0-100) based on their skills, experience level, and background. 
Generate a JSON response with this exact structure (no markdown, just the JSON). Ensure "evaluatedJobs" is an array matching the exact index and order of the provided jobs. Do not omit any jobs.
{
  "evaluatedJobs": [
    {
      "jobIndex": 0,
      "score": 85,
      "reason": "1-2 short sentences explaining why this is a good or bad fit."
    }
  ]
}`;
}

// ─── Fill History Logging ─────────────────────────────────────────────────

async function logFillEvent({ url, company, role, fieldsCount, timestamp }) {
  const { fillHistory = [] } = await chrome.storage.local.get('fillHistory');
  fillHistory.unshift({
    url,
    company: company || extractCompanyFromURL(url),
    role: role || 'Unknown Role',
    fieldsCount,
    timestamp: timestamp || Date.now()
  });
  const trimmed = fillHistory.slice(0, 100);
  await chrome.storage.local.set({ fillHistory: trimmed });
}

function extractCompanyFromURL(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return hostname.split('.')[0];
  } catch {
    return 'Unknown';
  }
}
