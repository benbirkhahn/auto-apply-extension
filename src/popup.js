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
let detectedJobInfo = null;

document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  await renderProfile();
  await detectSite(tab);
  setupListeners();
  loadAIToggle();
}

async function detectSite(tab) {
  if (!tab || !tab.url) return;
  const hostname = new URL(tab.url).hostname.replace('www.', '');
  const siteEntry = Object.entries(SUPPORTED_SITES).find(([domain]) => hostname.includes(domain));

  const siteDiv = document.getElementById('site-detected');
  const siteNameEl = document.getElementById('detected-site');
  const fillBtn = document.getElementById('fill-btn');

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM' });
    if (response && response.detected) {
      detectedJobInfo = response.jobInfo;
    }
  } catch (err) {
    // Content script not yet injected (tab was open before extension installed/updated).
    // Inject it programmatically and retry once.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content.js']
      });
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM' });
      if (response && response.detected) {
        detectedJobInfo = response.jobInfo;
      }
    } catch (injectErr) {
      // Restricted page (chrome://, Web Store, etc.) — silently continue.
      console.warn('Could not inject content script:', injectErr);
    }
  }

  // Check if it's a job search page (Linkedin or Indeed) to show Scan button
  const isJobSearch = tab.url && (/linkedin\.com\/jobs/i.test(tab.url) || /indeed\.com/i.test(tab.url));
  const scanBtn = document.getElementById('scan-jobs-btn');
  if (isJobSearch) {
    scanBtn.style.display = 'block';
  }

  if (siteEntry) {
    siteDiv.style.display = 'block';
    siteNameEl.textContent = siteEntry[1];
    if (isJobSearch) {
      setStatus('active', `Ready to fill OR scan jobs on <strong>${siteEntry[1]}</strong>`);
    } else {
      setStatus('active', `Ready to fill on <strong>${siteEntry[1]}</strong>`);
    }
  } else {
    setStatus('active', 'Click Fill to attempt auto-fill on this page');
  }

  const profile = await getProfile();
  if (profile && profile.firstName) fillBtn.disabled = false;
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

function setStatus(type, html) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = 'status-dot' + (type === 'warning' ? ' warning' : type === 'error' ? ' error' : '');
  text.innerHTML = html;
}

function setupListeners() {
  document.getElementById('fill-btn').addEventListener('click', handleFill);
  document.getElementById('scan-jobs-btn').addEventListener('click', handleScanJobs);
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
  btnText.innerHTML = '<span class="loading-icon">🤖</span>Thinking...';

  const profile = await getProfile();
  const aiMode = await getAIMode();

  let aiContent = null;
  if (aiMode) {
    try {
      showToast(`AI: company="${detectedJobInfo?.company || 'NONE'}" desc=${detectedJobInfo?.description?.length || 0}chars`, 'success');
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_AI_CONTENT',
        payload: {
          profile,
          jobDescription: detectedJobInfo?.description || '',
          jobTitle: detectedJobInfo?.jobTitle || '',
          company: detectedJobInfo?.company || ''
        }
      });
      if (response && response.success) {
        aiContent = response.data;
        showToast(`AI OK! whyCompany: ${aiContent.whyCompany ? 'YES' : 'MISSING'}`, 'success');
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw new Error(response.error || 'AI generation failed');
      }
    } catch (err) {
      console.error('AI Error:', err);
      showToast(`AI Error: ${err.message}`, 'error');
      btn.disabled = false;
      btnText.textContent = 'Fill Application';
      return;
    }
  }

  btnText.innerHTML = '<span class="loading-icon">✍️</span>Filling...';

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'FILL_FORM',
      profile,
      aiMode,
      aiContent
    });

    if (response && response.success) {
      showToast(`✓ Filled ${response.count || 'multiple'} fields!`);
      // Log history
      chrome.runtime.sendMessage({
        type: 'LOG_FILL',
        payload: {
          url: currentTab.url,
          company: detectedJobInfo?.company,
          role: detectedJobInfo?.jobTitle,
          fieldsCount: response.count
        }
      });
    } else {
      showToast('⚠ Partial fill — check for manual review.', 'error');
    }
  } catch (err) {
    showToast('Could not connect to page.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Fill Application';
  }
}

async function handleScanJobs() {
  const btn = document.getElementById('scan-jobs-btn');
  const btnText = document.getElementById('scan-jobs-btn-text');
  btn.disabled = true;
  btnText.innerHTML = '<span class="loading-icon">🤖</span> Scanning...';

  try {
    const profile = await getProfile();
    if (!profile) throw new Error('No profile found. Please set up your profile first.');

    // 1. Get jobs from content script
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'SCAN_JOBS' });
    if (!response || !response.success || !response.jobs || response.jobs.length === 0) {
      throw new Error('No jobs found on this page.');
    }

    const { jobs } = response;
    showToast(`Found ${jobs.length} jobs. Evaluating fit...`, 'success');
    btnText.innerHTML = '<span class="loading-icon">🤖</span> Evaluating Fit...';

    // 2. Evaluate using background script
    const aiMode = await getAIMode();
    if (!aiMode) throw new Error('AI Mode is disabled. Enable it to use the Job Scanner.');

    const aiResponse = await chrome.runtime.sendMessage({
      type: 'EVALUATE_JOBS',
      payload: { profile, jobs }
    });

    if (aiResponse && aiResponse.success) {
      renderJobScanResults(jobs, aiResponse.data);
      showToast('Evaluation complete!', 'success');
    } else {
      throw new Error(aiResponse.error || 'Failed to evaluate jobs.');
    }

  } catch (err) {
    console.error('Scan error:', err);
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Scan Page for Jobs';
  }
}

function renderJobScanResults(jobs, evaluatedJobs) {
  const resultsContainer = document.getElementById('scan-results');
  const listContainer = document.getElementById('jobs-list');
  
  // Merge evaluations with original jobs
  const mergedJobs = jobs.map((job, idx) => {
    const evalData = evaluatedJobs.find(e => e.jobIndex === idx) || { fitScore: 0, reason: 'Evaluation failed.' };
    return { ...job, ...evalData };
  });

  // Sort descending by score
  mergedJobs.sort((a, b) => b.fitScore - a.fitScore);

  listContainer.innerHTML = mergedJobs.map(job => {
    let scoreClass = 'score-low';
    if (job.fitScore >= 75) scoreClass = 'score-high';
    else if (job.fitScore >= 50) scoreClass = 'score-med';

    return `
      <div class="job-card">
        <div class="job-card-header">
          <div>
            <div class="job-card-title">${escapeHTML(job.title)}</div>
            <div class="job-card-company">${escapeHTML(job.company)}</div>
          </div>
          <div class="job-card-score ${scoreClass}">${job.fitScore}/100</div>
        </div>
        <div class="job-card-reason">${escapeHTML(job.reason)}</div>
        ${job.link ? `<a href="${job.link}" target="_blank" class="job-card-link">View Job ↗</a>` : ''}
      </div>
    `;
  }).join('');

  resultsContainer.style.display = 'block';
}

function escapeHTML(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
