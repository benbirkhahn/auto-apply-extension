// resume-parser.js — PDF resume extraction via Claude API (most reliable approach)
// Falls back to pure-JS text extraction for basic fields if no API key is set.

'use strict';

/**
 * Main entry point — parses a PDF File and returns a structured profile object.
 * @param {File} file
 * @returns {Promise<Object>}
 */
window.parseResumePDF = async function (file) {
  const keys = await chrome.storage.local.get(['apiKeyClaude', 'apiKeyOpenAI', 'apiKeyGemini', 'apiKey', 'aiSettings']);
  const provider = keys.aiSettings?.provider || 'claude';

  // Route to the correct API based on the active provider setting
  if (provider === 'gemini' && keys.apiKeyGemini) {
    return parseWithGemini(file, keys.apiKeyGemini);
  }
  if (provider === 'openai' && keys.apiKeyOpenAI) {
    return parseWithOpenAI(file, keys.apiKeyOpenAI);
  }
  // Claude (default) — support both new key name and legacy fallback
  const claudeKey = keys.apiKeyClaude || keys.apiKey;
  if (claudeKey) {
    return parseWithClaude(file, claudeKey);
  }
  // Last resort: try any available key regardless of provider setting
  if (keys.apiKeyGemini) return parseWithGemini(file, keys.apiKeyGemini);
  if (keys.apiKeyOpenAI) return parseWithOpenAI(file, keys.apiKeyOpenAI);

  // Fallback: basic pure-JS extraction (works on simple text PDFs)
  return parseWithFallback(file);
};

// ─── Claude API Parser ────────────────────────────────────────────────────

async function parseWithClaude(file, apiKey) {
  const base64 = await fileToBase64(file);

  const prompt = `Extract all resume information from this PDF and return it as a single JSON object with EXACTLY this structure. Be thorough — extract everything you can see.

{
  "firstName": "first name only",
  "lastName": "last name only",
  "email": "email address",
  "phone": "phone number",
  "city": "city",
  "state": "state/province abbreviation",
  "country": "country",
  "address": "street address if present",
  "zip": "zip/postal code if present",
  "linkedin": "full linkedin URL or profile path",
  "github": "full github URL if present",
  "portfolio": "portfolio or personal website URL if present",
  "title": "current or most recent job title",
  "yearsExperience": "estimated total years of work experience as a number",
  "summary": "professional summary or objective statement, verbatim",
  "skills": ["skill1", "skill2", "...array of all skills mentioned"],
  "workHistory": [
    {
      "title": "job title",
      "company": "company name",
      "startDate": "start date (e.g. April 2024)",
      "endDate": "end date or Present",
      "description": "full description of responsibilities and achievements"
    }
  ],
  "education": [
    {
      "school": "school name",
      "degree": "degree type (e.g. BA, BS, MS)",
      "field": "field of study",
      "year": "graduation year or expected year",
      "gpa": "GPA if listed"
    }
  ],
  "projects": [
    {
      "name": "project name",
      "url": "project URL or GitHub link if present",
      "technologies": "comma-separated list of technologies/tools used",
      "description": "what the project does and key achievements"
    }
  ]
}

IMPORTANT: Do NOT put personal projects or side projects in workHistory. Only include actual paid employment in workHistory. Projects, side projects, freelance builds, and personal/portfolio work go in the projects array.

Return ONLY the JSON object. No markdown, no explanation, just the JSON.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [{
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64
          }
        }, {
          type: 'text',
          text: prompt
        }]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}. Check your Claude API key in AI Settings.`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse Claude response. Try again.');

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalize yearsExperience to a number
  if (parsed.yearsExperience && typeof parsed.yearsExperience === 'string') {
    const num = parseInt(parsed.yearsExperience);
    parsed.yearsExperience = isNaN(num) ? '' : String(num);
  }

  return parsed;
}

// ─── Gemini API Parser ────────────────────────────────────────────────────

async function parseWithGemini(file, apiKey) {
  const base64 = await fileToBase64(file);

  const prompt = `Extract all resume information from this PDF and return it as a single JSON object with EXACTLY this structure. Be thorough — extract everything you can see.

{
  "firstName": "first name only",
  "lastName": "last name only",
  "email": "email address",
  "phone": "phone number",
  "city": "city",
  "state": "state/province abbreviation",
  "country": "country",
  "address": "street address if present",
  "zip": "zip/postal code if present",
  "linkedin": "full linkedin URL or profile path",
  "github": "full github URL if present",
  "portfolio": "portfolio or personal website URL if present",
  "title": "current or most recent job title",
  "yearsExperience": "estimated total years of work experience as a number",
  "summary": "professional summary or objective statement, verbatim",
  "skills": ["skill1", "skill2", "...array of all skills mentioned"],
  "workHistory": [
    {
      "title": "job title",
      "company": "company name",
      "startDate": "start date (e.g. April 2024)",
      "endDate": "end date or Present",
      "description": "full description of responsibilities and achievements"
    }
  ],
  "education": [
    {
      "school": "school name",
      "degree": "degree type (e.g. BA, BS, MS)",
      "field": "field of study",
      "year": "graduation year or expected year",
      "gpa": "GPA if listed"
    }
  ],
  "projects": [
    {
      "name": "project name",
      "url": "project URL or GitHub link if present",
      "technologies": "comma-separated list of technologies/tools used",
      "description": "what the project does and key achievements"
    }
  ]
}

IMPORTANT: Do NOT put personal projects or side projects in workHistory. Only include actual paid employment in workHistory. Projects, side projects, freelance builds, and personal/portfolio work go in the projects array.

Return ONLY the JSON object. No markdown, no explanation, just the JSON.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: base64
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0 }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error ${response.status}. Check your Gemini API key in AI Settings.`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse Gemini response. Try again.');

  const parsed = JSON.parse(jsonMatch[0]);

  if (parsed.yearsExperience && typeof parsed.yearsExperience === 'string') {
    const num = parseInt(parsed.yearsExperience);
    parsed.yearsExperience = isNaN(num) ? '' : String(num);
  }

  return parsed;
}

// ─── OpenAI API Parser ────────────────────────────────────────────────────

async function parseWithOpenAI(file, apiKey) {
  const base64 = await fileToBase64(file);

  const prompt = `Extract all resume information from this PDF and return it as a single JSON object with EXACTLY this structure. Be thorough — extract everything you can see.

{
  "firstName": "first name only",
  "lastName": "last name only",
  "email": "email address",
  "phone": "phone number",
  "city": "city",
  "state": "state/province abbreviation",
  "country": "country",
  "address": "street address if present",
  "zip": "zip/postal code if present",
  "linkedin": "full linkedin URL or profile path",
  "github": "full github URL if present",
  "portfolio": "portfolio or personal website URL if present",
  "title": "current or most recent job title",
  "yearsExperience": "estimated total years of work experience as a number",
  "summary": "professional summary or objective statement, verbatim",
  "skills": ["skill1", "skill2", "...array of all skills mentioned"],
  "workHistory": [
    {
      "title": "job title",
      "company": "company name",
      "startDate": "start date (e.g. April 2024)",
      "endDate": "end date or Present",
      "description": "full description of responsibilities and achievements"
    }
  ],
  "education": [
    {
      "school": "school name",
      "degree": "degree type (e.g. BA, BS, MS)",
      "field": "field of study",
      "year": "graduation year or expected year",
      "gpa": "GPA if listed"
    }
  ],
  "projects": [
    {
      "name": "project name",
      "url": "project URL or GitHub link if present",
      "technologies": "comma-separated list of technologies/tools used",
      "description": "what the project does and key achievements"
    }
  ]
}

IMPORTANT: Do NOT put personal projects or side projects in workHistory. Only include actual paid employment in workHistory. Projects, side projects, freelance builds, and personal/portfolio work go in the projects array.

Return ONLY the JSON object. No markdown, no explanation, just the JSON.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:application/pdf;base64,${base64}` }
          },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error ${response.status}. Check your OpenAI API key in AI Settings.`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse OpenAI response. Try again.');

  const parsed = JSON.parse(jsonMatch[0]);

  if (parsed.yearsExperience && typeof parsed.yearsExperience === 'string') {
    const num = parseInt(parsed.yearsExperience);
    parsed.yearsExperience = isNaN(num) ? '' : String(num);
  }

  return parsed;
}

// ─── Fallback Pure-JS Parser ──────────────────────────────────────────────
// Works on basic text PDFs. For CIDFont/Google Docs PDFs, API is required.

async function parseWithFallback(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const raw = String.fromCharCode(...bytes);

  // Try to get any readable text from the PDF
  const text = extractReadableText(raw);

  if (!text || text.length < 30) {
    throw new Error(
      'Could not read this PDF format without an API key. ' +
      'Add your Claude API key in AI Settings to enable full resume parsing — it works on any PDF.'
    );
  }

  return parseResumeText(text);
}

function extractReadableText(raw) {
  let text = '';

  // Try parenthesis-encoded strings (Tj/TJ operators)
  const parenStrings = raw.match(/\(([^)\\]{2,})\)/g) || [];
  for (const s of parenStrings) {
    const inner = s.slice(1, -1)
      .replace(/\\n/g, ' ').replace(/\\r/g, '').replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(').replace(/\\\)/g, ')');
    if (/[a-zA-Z]{2,}/.test(inner)) text += inner + ' ';
  }

  // Clean
  text = text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/ {2,}/g, ' ').trim();
  return text;
}

// ─── Basic text parsing (fallback only) ──────────────────────────────────

function parseResumeText(text) {
  const result = {
    firstName: '', lastName: '', email: '', phone: '',
    city: '', state: '', country: '', linkedin: '', github: '',
    portfolio: '', summary: '', skills: [], workHistory: [], education: []
  };

  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) result.email = emailMatch[0];

  const phoneMatch = text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w%-]+/i);
  if (linkedinMatch) result.linkedin = 'https://' + linkedinMatch[0];

  const githubMatch = text.match(/github\.com\/[\w-]+/i);
  if (githubMatch) result.github = 'https://' + githubMatch[0];

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (line.includes('@') || /^\+?[\d\s().–-]{7,}$/.test(line)) continue;
    if (/^https?:\/\//i.test(line) || line.split(' ').length < 2 || line.length > 70) continue;
    const parts = line.trim().split(/\s+/);
    result.firstName = parts[0];
    result.lastName = parts.slice(1).join(' ');
    break;
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Strip "data:application/pdf;base64," prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
