// options.js — profile management UI logic

'use strict';

let workHistory = [];
let education = [];
let skills = [];

// ─── Init ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  await loadAllData();
  setupListeners();
  renderWorkList();
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

  // Load AI settings
  const { aiSettings } = await chrome.storage.local.get('aiSettings');
  if (aiSettings) {
    const tone = document.getElementById('aiTone');
    const length = document.getElementById('coverLetterLength');
    if (tone) tone.value = aiSettings.tone || 'professional';
    if (length) length.value = aiSettings.coverLetterLength || 'medium';
  }

  // Load API key indicator
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) {
    document.getElementById('apiKey').value = apiKey;
    document.getElementById('key-status').innerHTML =
      '<span style="color:#4ade80;">✓ API key saved</span>';
  }
}

// ─── Listeners ────────────────────────────────────────────────────────────

function setupListeners() {
  document.getElementById('save-personal').addEventListener('click', savePersonal);
  document.getElementById('save-work').addEventListener('click', saveWork);
  document.getElementById('save-edu').addEventListener('click', saveEdu);
  document.getElementById('save-skills').addEventListener('click', saveSkills);
  document.getElementById('save-ai').addEventListener('click', saveAI);
  document.getElementById('save-key').addEventListener('click', saveAPIKey);

  document.getElementById('add-work').addEventListener('click', () => {
    workHistory.push({ title: '', company: '', startDate: '', endDate: '', description: '' });
    renderWorkList();
  });

  document.getElementById('add-edu').addEventListener('click', () => {
    education.push({ school: '', degree: '', field: '', year: '' });
    renderEduList();
  });

  document.getElementById('add-skill-btn').addEventListener('click', addSkill);
  document.getElementById('skill-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSkill();
  });

  // Toggle API key visibility
  document.getElementById('toggle-key').addEventListener('click', () => {
    const input = document.getElementById('apiKey');
    const btn = document.getElementById('toggle-key');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      btn.textContent = 'Show';
    }
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
  const aiSettings = {
    tone: document.getElementById('aiTone').value,
    coverLetterLength: document.getElementById('coverLetterLength').value
  };
  await chrome.storage.local.set({ aiSettings });
  showSaveStatus('save-ai-status');
  showToast('AI settings saved!');
}

async function saveAPIKey() {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) { showToast('Please enter an API key', 'error'); return; }
  if (!key.startsWith('sk-ant')) { showToast('That doesn\'t look like a valid Claude API key', 'error'); return; }

  await chrome.storage.local.set({ apiKey: key });
  document.getElementById('key-status').innerHTML = '<span style="color:#4ade80;">✓ API key saved</span>';
  showToast('API key saved!');
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
  resultDiv.innerHTML = '<p style="color:#888; font-size:14px;">⏳ Parsing resume...</p>';

  try {
    const parsed = await window.parseResumePDF(file);
    if (!parsed) throw new Error('Could not parse PDF');

    // Merge into profile
    const { profile: existing = {} } = await chrome.storage.local.get('profile');
    const merged = { ...existing };

    if (parsed.firstName && !merged.firstName) merged.firstName = parsed.firstName;
    if (parsed.lastName && !merged.lastName) merged.lastName = parsed.lastName;
    if (parsed.email && !merged.email) merged.email = parsed.email;
    if (parsed.phone && !merged.phone) merged.phone = parsed.phone;
    if (parsed.linkedin && !merged.linkedin) merged.linkedin = parsed.linkedin;
    if (parsed.github && !merged.github) merged.github = parsed.github;
    if (parsed.summary && !merged.summary) merged.summary = parsed.summary;
    if (parsed.skills?.length) {
      skills = [...new Set([...(merged.skills || []), ...parsed.skills])];
      merged.skills = skills;
      renderSkills();
    }
    if (parsed.workHistory?.length) {
      workHistory = [...(merged.workHistory || []), ...parsed.workHistory];
      merged.workHistory = workHistory;
      renderWorkList();
    }
    if (parsed.education?.length) {
      education = [...(merged.education || []), ...parsed.education];
      merged.education = education;
      renderEduList();
    }

    await chrome.storage.local.set({ profile: merged });
    await loadAllData();

    resultDiv.innerHTML = `
      <div style="background:#1a2a1a; border:1px solid #2a4a2a; border-radius:8px; padding:14px;">
        <p style="color:#4ade80; font-size:14px; margin-bottom:8px;">✓ Resume parsed successfully!</p>
        <p style="color:#888; font-size:12px;">
          Found: ${parsed.workHistory?.length || 0} jobs, ${parsed.education?.length || 0} schools,
          ${parsed.skills?.length || 0} skills. Profile updated — review and save each section.
        </p>
      </div>`;
  } catch (err) {
    resultDiv.innerHTML = `<p style="color:#f87171; font-size:14px;">✗ Error: ${esc(err.message)}</p>`;
  }
}

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
