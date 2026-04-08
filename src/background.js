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

async function generateAIContent({ profile, jobDescription, jobTitle, company, apiKey }) {
  if (!apiKey) throw new Error('No API key configured. Add your Claude API key in Settings.');

  const prompt = buildPrompt(profile, jobDescription, jobTitle, company);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Parse JSON from response
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

  return `You are a professional job application assistant. Generate tailored content for a job application.

APPLICANT PROFILE:
Name: ${profile.firstName} ${profile.lastName}
Current Title: ${profile.title || 'N/A'}
Years of Experience: ${profile.yearsExperience || 'N/A'}
Skills: ${(profile.skills || []).join(', ')}
Summary: ${profile.summary || 'N/A'}

Work History:
${workHistory || 'N/A'}

Education:
${education || 'N/A'}

JOB DETAILS:
Title: ${jobTitle || 'N/A'}
Company: ${company || 'N/A'}
Description: ${jobDescription ? jobDescription.substring(0, 2000) : 'N/A'}

Generate a JSON response with this exact structure (no markdown, just the JSON):
{
  "coverLetter": "A compelling 3-paragraph cover letter tailored to this role and company. Be specific, professional, and highlight relevant experience. Do not use generic phrases.",
  "whyCompany": "2-3 sentences on why you want to work at this specific company",
  "whyRole": "2-3 sentences on why you are excited about this specific role",
  "greatestStrength": "1-2 sentences about your greatest professional strength relevant to this role",
  "growthArea": "1-2 sentences about an honest growth area, framed constructively",
  "contribution": "2-3 sentences on what unique value you would bring to this team"
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
  // Keep last 100 entries
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

// ─── Context Menu ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'autoapply-fill',
    title: 'AutoApply: Fill this form',
    contexts: ['page', 'editable']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'autoapply-fill') {
    const { profile } = await chrome.storage.local.get('profile');
    const { aiMode } = await chrome.storage.local.get('aiMode');
    if (!profile) {
      chrome.runtime.openOptionsPage();
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM', profile, aiMode });
  }
});
