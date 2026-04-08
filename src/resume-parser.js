// resume-parser.js — extracts profile data from a PDF resume using regex heuristics
// Uses PDF.js (loaded from CDN or bundled). Falls back to text extraction if PDF.js unavailable.

'use strict';

/**
 * Main entry point — parses a PDF File object and returns a structured profile object.
 * @param {File} file
 * @returns {Promise<Object>}
 */
window.parseResumePDF = async function (file) {
  const text = await extractTextFromPDF(file);
  if (!text) throw new Error('Could not extract text from PDF. Make sure the PDF is not image-only.');
  return parseResumeText(text);
};

// ─── PDF Text Extraction ──────────────────────────────────────────────────

async function extractTextFromPDF(file) {
  // Load PDF.js from CDN
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText.trim();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ─── Text Parser ──────────────────────────────────────────────────────────

function parseResumeText(text) {
  const result = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    linkedin: '',
    github: '',
    portfolio: '',
    summary: '',
    skills: [],
    workHistory: [],
    education: []
  };

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // ── Contact Info ──────────────────────────────────────────────────────

  // Email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) result.email = emailMatch[0];

  // Phone
  const phoneMatch = text.match(/(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  // LinkedIn
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch) result.linkedin = 'https://' + linkedinMatch[0];

  // GitHub
  const githubMatch = text.match(/github\.com\/[\w-]+/i);
  if (githubMatch) result.github = 'https://' + githubMatch[0];

  // Portfolio / Personal site
  const portfolioMatch = text.match(/https?:\/\/(?!linkedin|github)[\w.-]+\.[a-z]{2,}[^\s]*/i);
  if (portfolioMatch) result.portfolio = portfolioMatch[0];

  // ── Name ─────────────────────────────────────────────────────────────
  // Heuristic: first non-empty line that is NOT an email/phone/URL is likely the name
  for (const line of lines.slice(0, 6)) {
    if (
      !line.includes('@') &&
      !line.match(/^\+?[\d\s().–-]{7,}$/) &&
      !line.match(/^https?:\/\//i) &&
      !line.match(/^linkedin|github/i) &&
      line.split(' ').length >= 2 &&
      line.split(' ').length <= 5 &&
      line.length < 60 &&
      /^[A-Za-z]/.test(line)
    ) {
      const parts = line.trim().split(/\s+/);
      result.firstName = parts[0];
      result.lastName = parts.slice(1).join(' ');
      break;
    }
  }

  // ── Sections ──────────────────────────────────────────────────────────
  const sectionHeaders = {
    summary: /^(summary|professional summary|profile|objective|about me|introduction)/i,
    skills: /^(skills|technical skills|core competencies|technologies|competencies|tools)/i,
    work: /^(experience|work experience|employment|professional experience|work history|career)/i,
    education: /^(education|academic|qualifications|degrees)/i
  };

  let currentSection = null;
  const sections = { summary: [], skills: [], work: [], education: [] };

  for (const line of lines) {
    const isHeader = Object.entries(sectionHeaders).find(([, regex]) => regex.test(line));
    if (isHeader) {
      currentSection = isHeader[0];
      continue;
    }
    if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  if (sections.summary.length) {
    result.summary = sections.summary.slice(0, 5).join(' ').substring(0, 600);
  }

  // ── Skills ────────────────────────────────────────────────────────────
  if (sections.skills.length) {
    const skillText = sections.skills.join(' ');
    result.skills = skillText
      .split(/[,•|·\/\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 40 && /[a-zA-Z]/.test(s))
      .slice(0, 40);
  }

  // ── Work History ──────────────────────────────────────────────────────
  if (sections.work.length) {
    result.workHistory = parseWorkSection(sections.work);
  }

  // ── Education ─────────────────────────────────────────────────────────
  if (sections.education.length) {
    result.education = parseEducationSection(sections.education);
  }

  return result;
}

// ─── Work Section Parser ──────────────────────────────────────────────────

function parseWorkSection(lines) {
  const jobs = [];
  let currentJob = null;
  const descLines = [];

  const datePattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[\s.]*\d{4}\b|\b\d{4}\s*[-–]\s*(\d{4}|present|current)\b/i;

  for (const line of lines) {
    const hasDate = datePattern.test(line);

    if (hasDate && line.length < 120) {
      // Save previous job
      if (currentJob) {
        currentJob.description = descLines.splice(0).join(' ').substring(0, 400);
        jobs.push(currentJob);
        descLines.length = 0;
      }

      const dateMatch = line.match(/(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d{4}|\d{4})\s*[-–to]+\s*(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d{4}|\d{4}|present|current)/i);
      const startDate = dateMatch?.[1] || '';
      const endDate = dateMatch?.[2] || 'Present';

      // Title / company heuristic: text before the date
      const beforeDate = line.replace(datePattern, '').trim();
      const parts = beforeDate.split(/[,|·•\-–]+/).map(s => s.trim()).filter(Boolean);

      currentJob = {
        title: parts[0] || '',
        company: parts[1] || '',
        startDate,
        endDate,
        description: ''
      };
    } else if (currentJob && line.length > 10) {
      descLines.push(line);
    }
  }

  if (currentJob) {
    currentJob.description = descLines.join(' ').substring(0, 400);
    jobs.push(currentJob);
  }

  return jobs.slice(0, 8);
}

// ─── Education Section Parser ─────────────────────────────────────────────

function parseEducationSection(lines) {
  const schools = [];
  let currentSchool = null;

  const degreeKeywords = /\b(b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|ph\.?d\.?|bachelor|master|associate|doctor|mba|llb|llm|be|btech|mtech)\b/i;
  const yearPattern = /\b(19|20)\d{2}\b/;

  for (const line of lines) {
    const hasDegree = degreeKeywords.test(line);
    const hasYear = yearPattern.test(line);

    if (hasDegree || (hasYear && line.length < 100)) {
      if (currentSchool) schools.push(currentSchool);
      const yearMatch = line.match(yearPattern);
      const degreeMatch = line.match(degreeKeywords);

      // Heuristic: school name is usually first part before comma or degree
      const parts = line.split(/[,|·•]+/).map(s => s.trim()).filter(Boolean);

      currentSchool = {
        school: parts.find(p => !degreeKeywords.test(p) && !yearPattern.test(p)) || parts[0] || '',
        degree: degreeMatch?.[0] || '',
        field: '',
        year: yearMatch?.[0] || '',
        gpa: ''
      };

      // Try to extract field of study
      const inMatch = line.match(/(?:in|of)\s+([\w\s&]+?)(?:,|\.|$)/i);
      if (inMatch) currentSchool.field = inMatch[1].trim();

      // GPA
      const gpaMatch = line.match(/gpa[:\s]+([0-9.]+)/i);
      if (gpaMatch) currentSchool.gpa = gpaMatch[1];
    }
  }

  if (currentSchool) schools.push(currentSchool);
  return schools.slice(0, 5);
}
