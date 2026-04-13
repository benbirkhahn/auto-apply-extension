// options.js — profile management UI logic

'use strict';

let workHistory = [];
let education = [];
let skills = [];
let projects = [];

// ─── Init ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  await loadAllData();
  setupListeners();
  renderWorkList();
  renderProjectsList();
  renderEduList();
  renderSkills();
  await loadHistory();
});

// ─── Navigation ───────────────────────────────────────────────────────────

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const section = document.getElementById('section-' + item.dataset.section);
      if (section) section.classList.add('active');
      if (item.dataset.section === 'history') loadHistory();
    });
  });
}

// ─── Load All Data ─────────────────────────────────────────────────────────

async function loadAllData() {
  const { profile } = await chrome.storage.local.get('profile');
  if (!profile) return;

  const fields = ['firstName', 'lastName', 'email', 'phone', 'title', 'yearsExperience',
    'city', 'state', 'zip', 'address', 'country', 'linkedin', 'github', 'portfolio',
    'expectedSalary', 'summary', 'defaultCoverLetter', 'workAuthStatus', 'requiresSponsorship'];

  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el && profile[f] !== undefined) el.value = profile[f];
  });

  const workAuth = document.getElementById('workAuthorized');
  if (workAuth) workAuth.checked = !!profile.workAuthorized;

  workHistory = profile.workHistory || [];
  education = profile.education || [];
  skills = profile.skills || [];
  projects = profile.projects || [];

  // Load AI settings
  const { aiSettings } = await chrome.storage.local.get('aiSettings');
  if (aiSettings) {
    const tone = document.getElementById('aiTone');
    const length = document.getElementById('coverLetterLength');
    const provider = document.getElementById('aiProvider');
    if (tone) tone.value = aiSettings.tone || 'professional';
    if (length) length.value = aiSettings.coverLetterLength || 'medium';
    if (provider) {
      provider.value = aiSettings.provider || 'claude';
      updateProviderUI(provider.value);
    }
  }

  // Load API keys
  const keys = await chrome.storage.local.get(['apiKeyClaude', 'apiKeyOpenAI', 'apiKeyGemini', 'apiKey']);
  if (keys.apiKeyClaude) document.getElementById('apiKeyClaude').value = keys.apiKeyClaude;
  if (keys.apiKeyOpenAI) document.getElementById('apiKeyOpenAI').value = keys.apiKeyOpenAI;
  if (keys.apiKeyGemini) document.getElementById('apiKeyGemini').value = keys.apiKeyGemini;
  
  // Migration/Fallback for old 'apiKey' (Claude)
  if (keys.apiKey && !keys.apiKeyClaude) {
    document.getElementById('apiKeyClaude').value = keys.apiKey;
    await chrome.storage.local.set({ apiKeyClaude: keys.apiKey });
  }

  if (keys.apiKeyClaude || keys.apiKeyOpenAI || keys.apiKeyGemini) {
    document.getElementById('key-status').innerHTML =
      '<span style="color:#4ade80;">✓ API settings saved</span>';
  }
}

// ─── Listeners ────────────────────────────────────────────────────────────

function setupListeners() {
  document.getElementById('save-personal').addEventListener('click', savePersonal);
  document.getElementById('save-work').addEventListener('click', saveWork);
  document.getElementById('save-projects').addEventListener('click', saveProjects);
  document.getElementById('save-edu').addEventListener('click', saveEdu);
  document.getElementById('save-skills').addEventListener('click', saveSkills);
  document.getElementById('save-ai').addEventListener('click', saveAI);
  document.getElementById('save-key').addEventListener('click', saveAPIKey);

  document.getElementById('add-work').addEventListener('click', () => {
    workHistory.push({ title: '', company: '', startDate: '', endDate: '', description: '' });
    renderWorkList();
  });

  document.getElementById('add-project').addEventListener('click', () => {
    projects.push({ name: '', url: '', description: '', technologies: '' });
    renderProjectsList();
  });

  document.getElementById('add-edu').addEventListener('click', () => {
    education.push({ school: '', degree: '', field: '', year: '' });
    renderEduList();
  });

  document.getElementById('add-skill-btn').addEventListener('click', addSkill);
  document.getElementById('skill-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSkill();
  });

  document.getElementById('aiProvider').addEventListener('change', (e) => {
    updateProviderUI(e.target.value);
  });

  // Toggle API key visibility (multiple)
  document.querySelectorAll('.toggle-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  });

  // Resume upload
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('resume-file');

  uploadZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => handleResumeUpload(e.target.files[0]));

  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('dragging');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') handleResumeUpload(file);
    else showToast('Please drop a PDF file', 'error');
  });
}

// ─── Save Personal ────────────────────────────────────────────────────────

async function savePersonal() {
  const fields = ['firstName', 'lastName', 'email', 'phone', 'title', 'yearsExperience',
    'city', 'state', 'zip', 'address', 'country', 'linkedin', 'github', 'portfolio',
    'expectedSalary', 'summary', 'defaultCoverLetter', 'workAuthStatus', 'requiresSponsorship'];

  const { profile: existing = {} } = await chrome.storage.local.get('profile');
  const profile = { ...existing };

  fields.forEach(f => {
    const el = document.getElementById(f);
    if (el) profile[f] = el.value.trim();
  });

  profile.workAuthorized = document.getElementById('workAuthorized').checked;
  profile.workHistory = workHistory;
  profile.projects = projects;
  profile.education = education;
  profile.skills = skills;

  await chrome.storage.local.set({ profile });
  showSaveStatus('save-personal-status');
  showToast('Profile saved!');
}

// ─── Save Work History ────────────────────────────────────────────────────

async function saveWork() {
  collectWorkFromDOM();
  const { profile: existing = {} } = await chrome.storage.local.get('profile');
  await chrome.storage.local.set({ profile: { ...existing, workHistory } });
  showSaveStatus('save-work-status');
  showToast('Work history saved!');
}

function collectWorkFromDOM() {
  const items = document.querySelectorAll('#work-list .list-item');
  workHistory = Array.from(items).map(item => ({
    title: item.querySelector('[data-field="title"]')?.value || '',
    company: item.querySelector('[data-field="company"]')?.value || '',
    startDate: item.querySelector('[data-field="startDate"]')?.value || '',
    endDate: item.querySelector('[data-field="endDate"]')?.value || '',
    description: item.querySelector('[data-field="description"]')?.value || ''
  }));
}

function renderWorkList() {
  const list = document.getElementById('work-list');
  list.innerHTML = '';
  workHistory.forEach((job, i) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <button class="remove-btn" data-idx="${i}" title="Remove">✕</button>
      <div class="form-grid" style="margin-bottom:10px;">
        <div class="field">
          <label>Job Title</label>
          <input type="text" data-field="title" value="${esc(job.title)}" placeholder="Software Engineer" />
        </div>
        <div class="field">
          <label>Company</label>
          <input type="text" data-field="company" value="${esc(job.company)}" placeholder="Acme Corp" />
        </div>
        <div class="field">
          <label>Start Date</label>
          <input type="text" data-field="startDate" value="${esc(job.startDate)}" placeholder="Jan 2021" />
        </div>
        <div class="field">
          <label>End Date</label>
          <input type="text" data-field="endDate" value="${esc(job.endDate)}" placeholder="Present" />
        </div>
      </div>
      <div class="field">
        <label>Description / Achievements</label>
        <textarea data-field="description" rows="3" placeholder="Key responsibilities and achievements...">${esc(job.description)}</textarea>
      </div>`;
    div.querySelector('.remove-btn').addEventListener('click', () => {
      collectWorkFromDOM();
      workHistory.splice(i, 1);
      renderWorkList();
    });
    list.appendChild(div);
  });
}

// ─── Save Projects ────────────────────────────────────────────────────────

async function saveProjects() {
  collectProjectsFromDOM();
  const { profile: existing = {} } = await chrome.storage.local.get('profile');
  await chrome.storage.local.set({ profile: { ...existing, projects } });
  showSaveStatus('save-projects-status');
  showToast('Projects saved!');
}

function collectProjectsFromDOM() {
  const items = document.querySelectorAll('#projects-list .list-item');
  projects = Array.from(items).map(item => ({
    name: item.querySelector('[data-field="name"]')?.value || '',
    url: item.querySelector('[data-field="url"]')?.value || '',
    technologies: item.querySelector('[data-field="technologies"]')?.value || '',
    description: item.querySelector('[data-field="description"]')?.value || ''
  }));
}

function renderProjectsList() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  projects.forEach((proj, i) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <button class="remove-btn" data-idx="${i}" title="Remove">✕</button>
      <div class="form-grid" style="margin-bottom:10px;">
        <div class="field">
          <label>Project Name</label>
          <input type="text" data-field="name" value="${esc(proj.name)}" placeholder="My Awesome Project" />
        </div>
        <div class="field">
          <label>URL / Link (optional)</label>
          <input type="url" data-field="url" value="${esc(proj.url || '')}" placeholder="https://github.com/you/project" />
        </div>
        <div class="field span-2">
          <label>Technologies Used</label>
          <input type="text" data-field="technologies" value="${esc(proj.technologies || '')}" placeholder="React, Node.js, PostgreSQL..." />
        </div>
      </div>
      <div class="field">
        <label>Description / What You Built</label>
        <textarea data-field="description" rows="3" placeholder="What the project does, your role, and key outcomes...">${esc(proj.description)}</textarea>
      </div>`;
    div.querySelector('.remove-btn').addEventListener('click', () => {
      collectProjectsFromDOM();
      projects.splice(i, 1);
      renderProjectsList();
    });
    list.appendChild(div);
  });
}

// ─── Save Education ───────────────────────────────────────────────────────

async function saveEdu() {
  collectEduFromDOM();
  const { profile: existing = {} } = await chrome.storage.local.get('profile');
  await chrome.storage.local.set({ profile: { ...existing, education } });
  showSaveStatus('save-edu-status');
  showToast('Education saved!');
}

function collectEduFromDOM() {
  const items = document.querySelectorAll('#edu-list .list-item');
  education = Array.from(items).map(item => ({
    school: item.querySelector('[data-field="school"]')?.value || '',
    degree: item.querySelector('[data-field="degree"]')?.value || '',
    field: item.querySelector('[data-field="field"]')?.value || '',
    year: item.querySelector('[data-field="year"]')?.value || '',
    gpa: item.querySelector('[data-field="gpa"]')?.value || ''
  }));
}

function renderEduList() {
  const list = document.getElementById('edu-list');
  list.innerHTML = '';
  education.forEach((edu, i) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <button class="remove-btn" data-idx="${i}" title="Remove">✕</button>
      <div class="form-grid triple">
        <div class="field span-2">
          <label>School / University</label>
          <input type="text" data-field="school" value="${esc(edu.school)}" placeholder="MIT" />
        </div>
        <div class="field">
          <label>Graduation Year</label>
          <input type="text" data-field="year" value="${esc(edu.year)}" placeholder="2019" />
        </div>
        <div class="field">
          <label>Degree</label>
          <input type="text" data-field="degree" value="${esc(edu.degree)}" placeholder="B.S." />
        </div>
        <div class="field">
          <label>Field of Study</label>
          <input type="text" data-field="field" value="${esc(edu.field)}" placeholder="Computer Science" />
        </div>
        <div class="field">
          <label>GPA (optional)</label>
          <input type="text" data-field="gpa" value="${esc(edu.gpa || '')}" placeholder="3.8" />
        </div>
      </div>`;
    div.querySelector('.remove-btn').addEventListener('click', () => {
      collectEduFromDOM();
      education.splice(i, 1);
      renderEduList();
    });
    list.appendChild(div);
  });
}

// ─── Skills ───────────────────────────────────────────────────────────────

async function saveSkills() {
  const { profile: existing = {} } = await chrome.storage.local.get('profile');
  await chrome.storage.local.set({ profile: { ...existing, skills } });
  showSaveStatus('save-skills-status');
  showToast('Skills saved!');
}

function addSkill() {
  const input = document.getElementById('skill-input');
  const val = input.value.trim();
  if (!val) return;

  // Support comma-separated
  const newSkills = val.split(',').map(s => s.trim()).filter(s => s && !skills.includes(s));
  skills.push(...newSkills);
  input.value = '';
  renderSkills();
}

function renderSkills() {
  const container = document.getElementById('skills-container');
  container.innerHTML = '';
  skills.forEach((skill, i) => {
    const chip = document.createElement('div');
    chip.className = 'skill-chip';
    chip.innerHTML = `<span>${esc(skill)}</span><button data-idx="${i}">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      skills.splice(i, 1);
      renderSkills();
    });
    container.appendChild(chip);
  });
}

// ─── AI Settings ──────────────────────────────────────────────────────────

async function saveAI() {
  const { aiSettings: existing = {} } = await chrome.storage.local.get('aiSettings');
  const aiSettings = {
    ...existing,
    tone: document.getElementById('aiTone').value,
    coverLetterLength: document.getElementById('coverLetterLength').value,
    provider: document.getElementById('aiProvider').value
  };
  await chrome.storage.local.set({ aiSettings });
  showSaveStatus('save-ai-status');
  showToast('AI preferences saved!');
}

async function saveAPIKey() {
  const provider = document.getElementById('aiProvider').value;
  const keyClaude = document.getElementById('apiKeyClaude').value.trim();
  const keyOpenAI = document.getElementById('apiKeyOpenAI').value.trim();
  const keyGemini = document.getElementById('apiKeyGemini').value.trim();

  // Basic validation for active provider
  if (provider === 'claude' && keyClaude && !keyClaude.startsWith('sk-ant')) {
    showToast('That doesn\'t look like a valid Claude API key', 'error');
    return;
  }
  if (provider === 'openai' && keyOpenAI && !keyOpenAI.startsWith('sk-')) {
    showToast('That doesn\'t look like a valid OpenAI API key', 'error');
    return;
  }

  await chrome.storage.local.set({
    apiKeyClaude: keyClaude,
    apiKeyOpenAI: keyOpenAI,
    apiKeyGemini: keyGemini,
    // Keep legacy key synced if claude is used
    apiKey: keyClaude
  });

  // Also save the provider in aiSettings
  const { aiSettings = {} } = await chrome.storage.local.get('aiSettings');
  aiSettings.provider = provider;
  await chrome.storage.local.set({ aiSettings });

  document.getElementById('key-status').innerHTML = '<span style="color:#4ade80;">✓ Settings saved</span>';
  showToast('AI settings saved!');
}

function updateProviderUI(provider) {
  document.querySelectorAll('.provider-config').forEach(el => el.style.display = 'none');
  const activeConfig = document.getElementById(`${provider}-config`);
  if (activeConfig) activeConfig.style.display = 'block';
}

// ─── History ──────────────────────────────────────────────────────────────

async function loadHistory() {
  const { fillHistory = [] } = await chrome.storage.local.get('fillHistory');
  const list = document.getElementById('history-list');

  if (!fillHistory.length) {
    list.innerHTML = '<p style="color:#666; font-size:14px;">No history yet. Start filling applications!</p>';
    return;
  }

  list.innerHTML = fillHistory.map(entry => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #1a1a1a;">
      <div>
        <div style="font-size:14px; color:#e0e0e0;">${esc(entry.company || 'Unknown Company')}</div>
        <div style="font-size:12px; color:#666;">${esc(entry.role || '')} · ${esc(entry.url || '')}</div>
      </div>
      <div style="font-size:12px; color:#555; text-align:right;">
        <div>${entry.fieldsCount || '?'} fields</div>
        <div>${new Date(entry.timestamp).toLocaleDateString()}</div>
      </div>
    </div>`
  ).join('');
}

// ─── Resume Upload ─────────────────────────────────────────────────────────

async function handleResumeUpload(file) {
  if (!file) return;
  const resultDiv = document.getElementById('parse-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `
    <div style="background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:16px; text-align:center;">
      <div style="font-size:24px; margin-bottom:8px;">⏳</div>
      <p style="color:#888; font-size:14px;">Reading your resume...</p>
    </div>`;

  try {
    const parsed = await window.parseResumePDF(file);
    if (!parsed) throw new Error('Could not parse PDF');

    // Track what was found for the summary
    const found = [];
    const skipped = [];

    // Merge into profile — always overwrite with parsed data (resume is source of truth)
    const { profile: existing = {} } = await chrome.storage.local.get('profile');
    const merged = { ...existing };

    const textFields = [
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['email', 'Email'],
      ['phone', 'Phone'],
      ['linkedin', 'LinkedIn'],
      ['github', 'GitHub'],
      ['portfolio', 'Portfolio'],
      ['summary', 'Summary']
    ];

    for (const [key, label] of textFields) {
      if (parsed[key]) {
        merged[key] = parsed[key];
        found.push(label);
      }
    }

    if (parsed.skills?.length) {
      skills = [...new Set([...(merged.skills || []), ...parsed.skills])];
      merged.skills = skills;
      found.push(`${parsed.skills.length} skills`);
      renderSkills();
    }

    if (parsed.workHistory?.length) {
      // Overwrite work history with parsed version (avoid duplicates)
      workHistory = parsed.workHistory;
      merged.workHistory = workHistory;
      found.push(`${parsed.workHistory.length} job${parsed.workHistory.length !== 1 ? 's' : ''}`);
      renderWorkList();
    }

    if (parsed.education?.length) {
      education = parsed.education;
      merged.education = education;
      found.push(`${parsed.education.length} school${parsed.education.length !== 1 ? 's' : ''}`);
      renderEduList();
    }

    if (parsed.projects?.length) {
      projects = parsed.projects;
      merged.projects = projects;
      found.push(`${parsed.projects.length} project${parsed.projects.length !== 1 ? 's' : ''}`);
      renderProjectsList();
    }

    await chrome.storage.local.set({ profile: merged });

    // Populate all DOM fields immediately so user sees results without reloading
    const domFields = ['firstName', 'lastName', 'email', 'phone', 'linkedin', 'github', 'portfolio', 'summary'];
    for (const f of domFields) {
      const el = document.getElementById(f);
      if (el && merged[f]) el.value = merged[f];
    }

    // Show success result
    resultDiv.innerHTML = `
      <div style="background:#1a2a1a; border:1px solid #2a4a2a; border-radius:8px; padding:16px;">
        <p style="color:#4ade80; font-size:15px; font-weight:600; margin-bottom:10px;">✓ Resume imported successfully!</p>
        <p style="color:#aaa; font-size:13px; margin-bottom:12px;">Found and filled: <strong style="color:#e0e0e0;">${found.join(', ')}</strong></p>
        <p style="color:#888; font-size:12px; margin-bottom:14px;">Review each section below, make any edits, then click Save.</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button data-goto="personal" style="background:#1a2a3a; border:1px solid #2a4a6a; color:#60a5fa; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">👤 Review Personal Info</button>
          <button data-goto="work" style="background:#1a2a3a; border:1px solid #2a4a6a; color:#60a5fa; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">💼 Review Work History</button>
          <button data-goto="projects" style="background:#1a2a3a; border:1px solid #2a4a6a; color:#60a5fa; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">🚀 Review Projects</button>
          <button data-goto="education" style="background:#1a2a3a; border:1px solid #2a4a6a; color:#60a5fa; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">🎓 Review Education</button>
          <button data-goto="skills" style="background:#1a2a3a; border:1px solid #2a4a6a; color:#60a5fa; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer;">⚡ Review Skills</button>
        </div>
      </div>`;

    // Attach listeners after injecting HTML (inline onclick blocked by CSP)
    resultDiv.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => switchToSection(btn.dataset.goto));
    });

    showToast(`Resume imported! Found ${found.join(', ')}.`);

  } catch (err) {
    console.error('Resume parse error:', err);
    resultDiv.innerHTML = `
      <div style="background:#2a1a1a; border:1px solid #4a2a2a; border-radius:8px; padding:16px;">
        <p style="color:#f87171; font-size:14px; font-weight:600; margin-bottom:6px;">✗ Could not read resume</p>
        <p style="color:#888; font-size:13px;">${esc(err.message)}</p>
        <p style="color:#666; font-size:12px; margin-top:8px;">
          Make sure the PDF contains selectable text (not a scanned image).
          Try opening the PDF and checking if you can highlight text.
        </p>
      </div>`;
  }
}

// Exposed globally for inline onclick buttons in the result card
window.switchToSection = function(sectionName) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-section="${sectionName}"]`);
  if (navItem) navItem.classList.add('active');
  const section = document.getElementById('section-' + sectionName);
  if (section) section.classList.add('active');
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (type === 'error' ? ' error' : '');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function showSaveStatus(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'inline';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}
