// popup.js — controls the extension popup UI

const SUPPORTED_SITES = {
  'linkedin.com': 'LinkedIn',
  'indeed.com': 'Indeed',
  'greenhouse.io': 'Greenhouse',
  'lever.co': 'Lever',
  'myworkdayjobs.com': 'Workday',
  'workday.com': 'Workday',
  'jobvite.com': 'Jobvite',
  'smartrecruiters.com': 'SmartRecruiters',
  'icims.com': 'iCIMS',
  'taleo.net': 'Taleo',
  'recruitee.com': 'Recruitee',
  'ashbyhq.com': 'Ashby'
};

let currentTab = null;

document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  await renderProfile();
  detectSite(tab.url);
  setupListeners();
  loadAIToggle();
}

async function renderProfile() {
  const profile = await getProfile();
  const section = document.getElementById('profile-section');

  if (!profile || !profile.firstName) {
    section.innerHTML = `
      <div class="no-profile">
        <div class="icon">👤</div>
        <div>No profile yet. Set up your profile to start auto-filling.</div>
      </div>`;
    document.getElementById('fill-btn').disabled = true;
    setStatus('warning', 'Profile incomplete — <strong>set up your profile first</strong>');
    return;
  }

  const completeness = calcCompleteness(profile);
  section.innerHTML = `
    <div class="profile-card">
      <div class="name">${profile.firstName} ${profile.lastName}</div>
      <div class="meta">${profile.title || ''} ${profile.email ? '· ' + profile.email : ''}</div>
      <div class="completeness">
        <div class="completeness-label">
          <span>Profile completeness</span>
          <span>${completeness}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${completeness}%"></div>
        </div>
      </div>
    </div>`;
}

function calcCompleteness(p) {
  const fields = ['firstName', 'lastName', 'email', 'phone', 'city', 'state', 'country',
    'title', 'summary', 'linkedin', 'github', 'portfolio', 'yearsExperience'];
  const filled = fields.filter(f => p[f] && p[f].trim()).length;
  const hasWork = p.workHistory && p.workHistory.length > 0;
  const hasEdu = p.education && p.education.length > 0;
  const hasSkills = p.skills && p.skills.length > 0;
  const extras = [hasWork, hasEdu, hasSkills].filter(Boolean).length;
  return Math.round(((filled + extras) / (fields.length + 3)) * 100);
}

function detectSite(url) {
  if (!url) return;
  const hostname = new URL(url).hostname.replace('www.', '');
  const siteEntry = Object.entries(SUPPORTED_SITES).find(([domain]) => hostname.includes(domain));

  const siteDiv = document.getElementById('site-detected');
  const siteNameEl = document.getElementById('detected-site');
  const fillBtn = document.getElementById('fill-btn');

  if (siteEntry) {
    siteDiv.style.display = 'block';
    siteNameEl.textContent = siteEntry[1];
    setStatus('active', `Ready to fill on <strong>${siteEntry[1]}</strong>`);
  } else {
    setStatus('active', 'Click Fill to attempt auto-fill on this page');
  }

  // Enable fill button if profile is set
  getProfile().then(p => {
    if (p && p.firstName) fillBtn.disabled = false;
  });
}

function setStatus(type, html) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = 'status-dot' + (type === 'warning' ? ' warning' : type === 'error' ? ' error' : '');
  text.innerHTML = html;
}

function setupListeners() {
  document.getElementById('fill-btn').addEventListener('click', handleFill);
  document.getElementById('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
  document.getElementById('ai-toggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ aiMode: e.target.checked });
  });
  document.getElementById('settings-link').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
  document.getElementById('report-btn').addEventListener('click', handleReport);
}

async function handleFill() {
  const btn = document.getElementById('fill-btn');
  const btnText = document.getElementById('fill-btn-text');

  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span>Filling...';

  const profile = await getProfile();
  const aiMode = await getAIMode();

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'FILL_FORM',
      profile,
      aiMode
    });

    if (response && response.success) {
      showToast(`✓ Filled ${response.count || 'multiple'} fields successfully!`);
    } else {
      showToast('⚠ Partial fill — some fields may need manual review.', 'error');
    }
  } catch (err) {
    showToast('Could not connect to page. Try refreshing first.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Fill Application';
  }
}

async function handleReport() {
  const issueUrl = `https://github.com/yourusername/auto-apply-extension/issues/new?title=Form+fill+issue+on+${encodeURIComponent(currentTab.url)}&labels=site-issue`;
  chrome.tabs.create({ url: issueUrl });
}

function loadAIToggle() {
  chrome.storage.local.get('aiMode', ({ aiMode }) => {
    document.getElementById('ai-toggle').checked = aiMode !== false;
  });
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (type === 'error' ? ' error' : '');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

async function getProfile() {
  return new Promise(resolve => {
    chrome.storage.local.get('profile', ({ profile }) => resolve(profile || null));
  });
}

async function getAIMode() {
  return new Promise(resolve => {
    chrome.storage.local.get('aiMode', ({ aiMode }) => resolve(aiMode !== false));
  });
}
