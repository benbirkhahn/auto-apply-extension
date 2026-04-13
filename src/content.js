// content.js — injected into every page, handles form detection and filling

(function () {
  'use strict';

  // Guard against being injected more than once (e.g. via scripting.executeScript fallback)
  if (window.__autoApplyLoaded) return;
  window.__autoApplyLoaded = true;

  // ─── Field Mapping ────────────────────────────────────────────────────────
  // Maps profile keys to common form field name/id/label patterns

  const FIELD_MAP = {
    firstName: {
      patterns: ['first.?name', 'fname', 'given.?name', 'first'],
      value: (p) => p.firstName
    },
    lastName: {
      patterns: ['last.?name', 'lname', 'surname', 'family.?name'],
      value: (p) => p.lastName
    },
    fullName: {
      patterns: ['full.?name', 'your.?name', '^name$'],
      value: (p) => `${p.firstName} ${p.lastName}`
    },
    email: {
      patterns: ['email', 'e.?mail'],
      value: (p) => p.email
    },
    phone: {
      patterns: ['phone', 'mobile', 'cell', 'telephone', 'tel'],
      value: (p) => p.phone
    },
    address: {
      patterns: ['address', 'street'],
      value: (p) => p.address
    },
    city: {
      patterns: ['city', 'town'],
      value: (p) => p.city
    },
    state: {
      patterns: ['state', 'province', 'region'],
      value: (p) => p.state
    },
    zip: {
      patterns: ['zip', 'postal', 'postcode'],
      value: (p) => p.zip
    },
    country: {
      patterns: ['country', 'nation'],
      value: (p) => p.country
    },
    linkedin: {
      patterns: ['linkedin', 'linked.in'],
      value: (p) => p.linkedin
    },
    github: {
      patterns: ['github', 'git.hub'],
      value: (p) => p.github
    },
    portfolio: {
      patterns: ['portfolio', 'website', 'personal.?site', 'personal.?url'],
      value: (p) => p.portfolio
    },
    title: {
      patterns: ['title', 'position', 'job.?title', 'current.?title', 'desired.?title'],
      value: (p) => p.title
    },
    salary: {
      patterns: ['salary', 'compensation', 'expected.?salary', 'desired.?salary'],
      value: (p) => p.expectedSalary
    },
    yearsExperience: {
      patterns: ['years.?of.?experience', 'experience.?years', 'years.?experience'],
      value: (p) => p.yearsExperience
    },
    summary: {
      patterns: ['summary', 'about.?you', 'about.?yourself', 'bio', 'introduction', 'objective'],
      value: (p) => p.summary
    },
    coverLetter: {
      patterns: ['cover.?letter', 'covering.?letter', 'motivation.?letter'],
      value: (p, aiContent) => aiContent?.coverLetter || p.defaultCoverLetter || ''
    },
    whyCompany: {
      patterns: [
        'why.+company', 'why.+us', 'why.+our', 'why.+join', 'why.+interested',
        'why.+want.+work', 'why.+apply', 'why.+this.+role', 'why.+position',
        'what.+interest.+you', 'what.+attract', 'motivation', 'what.+excit',
        '^why\\s+\\w+', 'why\\s+\\w+\\?'
      ],
      value: (p, aiContent) => aiContent?.whyCompany || ''
    },
    whyRole: {
      patterns: [
        'why.+role', 'why.+position', 'why.+job', 'what.+role',
        'fit.+role', 'suited.+role', 'qualify', 'why.+good.+fit'
      ],
      value: (p, aiContent) => aiContent?.whyRole || ''
    },
    greatestStrength: {
      patterns: ['strength', 'greatest.?strength', 'best.?quality', 'superpower'],
      value: (p, aiContent) => aiContent?.greatestStrength || ''
    },
    growthArea: {
      patterns: ['weakness', 'growth.?area', 'improve', 'development.?area', 'challenge.+yourself'],
      value: (p, aiContent) => aiContent?.growthArea || ''
    },
    contribution: {
      patterns: ['contribute', 'bring.+team', 'add.+value', 'offer.+company', 'unique.+value'],
      value: (p, aiContent) => aiContent?.contribution || ''
    }
  };

  // Site-specific selectors for known ATS platforms
  const SITE_SELECTORS = {
    'linkedin.com': {
      formSelector: '.jobs-easy-apply-content',
      nextButton: 'button[aria-label*="Continue"], button[aria-label*="Next"]',
      submitButton: 'button[aria-label*="Submit"]'
    },
    'greenhouse.io': {
      formSelector: '#application_form, form#application',
      submitButton: 'input[type="submit"], button[type="submit"]'
    },
    'lever.co': {
      formSelector: '.application-form',
      submitButton: 'button[type="submit"]'
    },
    'myworkdayjobs.com': {
      formSelector: '[data-automation-id="applicationForm"]',
      nextButton: '[data-automation-id="bottom-navigation-next-button"]',
      submitButton: '[data-automation-id="bottom-navigation-submit-button"]'
    },
    'workday.com': {
      formSelector: '[data-automation-id="applicationForm"]',
      nextButton: '[data-automation-id="bottom-navigation-next-button"]'
    }
  };

  // ─── Main Message Listener ────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FILL_FORM') {
      fillForm(message.profile, message.aiMode, message.aiContent)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // keep channel open for async
    }

    if (message.type === 'DETECT_FORM') {
      const detected = detectFormOnPage();
      const jobInfo = detected ? extractJobInfo() : null;
      sendResponse({ detected, url: window.location.href, jobInfo });
      return true;
    }

    if (message.type === 'SCAN_JOBS') {
      const jobs = extractJobCards();
      sendResponse({ success: true, jobs });
      return true;
    }

    if (message.type === 'SHOW_IN_PAGE_RESULTS') {
      injectFloatingSidebar(message.jobs);
      sendResponse({ success: true });
      return true;
    }
  });

  // ─── Form Detection ───────────────────────────────────────────────────────

  function detectFormOnPage() {
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
    return inputs.length > 2;
  }

  function extractJobCards() {
    const jobs = [];
    
    // LinkedIn
    if (window.location.hostname.includes('linkedin.com')) {
      const cards = document.querySelectorAll('li.jobs-search-results__list-item, .job-card-container');
      cards.forEach(card => {
        const titleEl = card.querySelector('.job-card-list__title, .artdeco-entity-lockup__title');
        const companyEl = card.querySelector('.job-card-container__company-name, .artdeco-entity-lockup__subtitle');
        const linkEl = card.querySelector('a.job-card-container__link, a.job-card-list__title, a.job-card-container__company-name');
        
        if (titleEl && companyEl) {
          jobs.push({
            title: titleEl.textContent.trim(),
            company: companyEl.textContent.trim(),
            link: linkEl ? linkEl.href : window.location.href,
            description: '' // Descriptions are generally separate or fetched via ajax, keep empty for now
          });
        }
      });
    } 
    // Indeed
    else if (window.location.hostname.includes('indeed.com')) {
      const cards = document.querySelectorAll('.job_seen_beacon, .slider_item');
      cards.forEach(card => {
        const titleEl = card.querySelector('h2.jobTitle, .jcs-JobTitle');
        const companyEl = card.querySelector('.companyName, [data-testid="company-name"]');
        const linkEl = card.querySelector('a.jcs-JobTitle');
        const descEl = card.querySelector('.job-snippet');
        
        if (titleEl && companyEl) {
          jobs.push({
            title: titleEl.textContent.trim(),
            company: companyEl.textContent.trim(),
            link: linkEl ? linkEl.href : window.location.href,
            description: descEl ? descEl.textContent.trim() : ''
          });
        }
      });
    }

    // Deduplicate
    const seen = new Set();
    const uniqueJobs = [];
    for (const job of jobs) {
      const key = `${job.title}|${job.company}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueJobs.push(job);
      }
    }

    return uniqueJobs.slice(0, 15);
  }

  function getSiteKey() {
    const host = window.location.hostname.replace('www.', '');
    return Object.keys(SITE_SELECTORS).find(k => host.includes(k));
  }

  function extractJobInfo() {
    // ── Indeed Smart Apply specific selectors ──
    const jobTitle = (
      document.querySelector('[data-testid="job-title"], .jobsearch-JobInfoHeader-title, h1.jobTitle, h1')
    )?.textContent?.trim() || '';

    const company = (
      document.querySelector('[data-testid="inlineHeader-companyName"], [data-company-name], .jobsearch-InlineCompanyRating-companyHeader, [class*="companyName"], [class*="company-name"]')
    )?.textContent?.trim() ||
    // Indeed SmartApply: company often in the top card
    document.querySelector('.ia-BasePage-header [data-testid*="company"], .css-87uc0g, .jobsearch-CompanyAvatar-companyName')?.textContent?.trim() ||
    // Indeed SmartApply top header e.g. "Valon Tech - New York"
    document.querySelector('[class*="JobHeader"] [class*="company"], [class*="jobHeader"] [class*="company"]')?.textContent?.trim() ||
    // Pull from page title: "AI Enablement Engineer - Valon Tech - New York" → "Valon Tech"
    (() => {
      const parts = document.title.split(' - ').map(s => s.trim()).filter(Boolean);
      // Company is usually the second segment (after job title, before location)
      return parts.length >= 2 ? parts[1] : '';
    })() || '';

    // ── Job description selectors ──
    const descriptionSelectors = [
      '[data-testid="job-description"]',
      '#job-description',
      '.jobsearch-jobDescriptionText',
      '.job-description',
      '[class*="jobDescription"]',
      'section.description',
      '.description__text',
      '[data-automation-id="job-description"]'
    ];

    let description = '';
    for (const sel of descriptionSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.length > 100) {
        description = el.innerText;
        break;
      }
    }

    // Indeed SmartApply: description is in a right-side panel or separate div
    if (!description) {
      // Look for the largest text block on the page
      const candidates = Array.from(document.querySelectorAll('div, section, article'));
      let best = '';
      for (const el of candidates) {
        const text = el.innerText?.trim() || '';
        if (text.length > best.length && text.length < 10000 && el.children.length < 50) {
          best = text;
        }
      }
      description = best.substring(0, 3000);
    }

    return { jobTitle, company, description };
  }

  // ─── Fill Logic ───────────────────────────────────────────────────────────

  async function fillForm(profile, aiMode, aiContent) {
    let filledCount = 0;
    const errors = [];

    const allInputs = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea'
    ));

    const allSelects = Array.from(document.querySelectorAll('select'));

    for (const input of allInputs) {
      try {
        const fieldKey = identifyField(input);
        if (!fieldKey) continue;

        const mapping = FIELD_MAP[fieldKey];
        if (!mapping) continue;

        const value = mapping.value(profile, aiContent);
        if (!value) continue;

        const filled = await fillInput(input, value);
        if (filled) filledCount++;
      } catch (e) {
        errors.push(e.message);
      }
    }

    // Handle dropdowns
    for (const select of allSelects) {
      try {
        const fieldKey = identifyField(select);
        if (!fieldKey) continue;
        const mapping = FIELD_MAP[fieldKey];
        if (!mapping) continue;
        const value = mapping.value(profile, aiContent);
        if (!value) continue;
        const filled = fillSelect(select, value);
        if (filled) filledCount++;
      } catch (e) {
        errors.push(e.message);
      }
    }

    // Handle checkboxes for authorization / legal questions
    fillCheckboxes(profile);

    return {
      success: filledCount > 0,
      count: filledCount,
      errors
    };
  }

  // ─── Field Identification ─────────────────────────────────────────────────

  function identifyField(el) {
    const candidates = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('data-field-name'),
      el.getAttribute('autocomplete'),
      getLabelText(el)
    ].filter(Boolean).map(s => s.toLowerCase());

    for (const [key, mapping] of Object.entries(FIELD_MAP)) {
      for (const pattern of mapping.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (candidates.some(c => regex.test(c))) {
          return key;
        }
      }
    }

    return null;
  }

  function getLabelText(el) {
    // Try label[for]
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent.trim();
    }
    // Try parent label
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    // Try aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }
    // Walk up DOM up to 6 levels looking for a label or heading nearby
    let node = el.parentElement;
    for (let i = 0; i < 6; i++) {
      if (!node) break;
      // Look for a label element inside this ancestor
      const label = node.querySelector('label, legend, h1, h2, h3, h4, [class*="label"], [class*="question"], [class*="title"]');
      if (label && label !== el) {
        const text = label.textContent.trim();
        if (text.length > 0 && text.length < 200) return text;
      }
      // Also check preceding siblings for text
      const prev = node.previousElementSibling;
      if (prev) {
        const text = prev.textContent.trim();
        if (text.length > 0 && text.length < 200) return text;
      }
      node = node.parentElement;
    }
    return '';
  }

  // ─── Input Filling ────────────────────────────────────────────────────────

  async function fillInput(input, value) {
    if (input.disabled || input.readOnly) return false;
    if (input.value === value) return false;

    // Focus the element
    input.focus();
    await sleep(50);

    // Use native input setter to bypass React's synthetic events
    const nativeInputValueSetter = (input.tagName === 'TEXTAREA'
      ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, value);
    } else {
      input.value = value;
    }

    // Trigger events that frameworks listen to
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.blur();

    await sleep(30);
    return true;
  }

  function fillSelect(select, value) {
    const lowerValue = value.toLowerCase();
    const option = Array.from(select.options).find(o =>
      o.text.toLowerCase().includes(lowerValue) ||
      o.value.toLowerCase().includes(lowerValue)
    );

    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillCheckboxes(profile) {
    // Common "work authorization" and legal checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of checkboxes) {
      const label = getLabelText(cb).toLowerCase();
      if (
        label.includes('authorized to work') ||
        label.includes('legally authorized') ||
        label.includes('eligible to work') ||
        label.includes('i agree to the terms') ||
        label.includes('i have read')
      ) {
        if (!cb.checked && profile.workAuthorized) {
          cb.click();
        }
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Floating UI ────────────────────────────────────────────────────────
  function injectFloatingSidebar(jobs) {
    let sidebar = document.getElementById('auto-apply-floating-sidebar');
    if (!sidebar) {
      sidebar = document.createElement('div');
      sidebar.id = 'auto-apply-floating-sidebar';
      
      Object.assign(sidebar.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '350px',
        maxHeight: 'calc(100vh - 40px)',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        transition: 'transform 0.3s ease'
      });

      document.body.appendChild(sidebar);
    }

    const headerHtml = `
      <div style="padding: 16px; background-color: #2563eb; color: white; display: flex; justify-content: space-between; align-items: center; border-radius: 12px 12px 0 0;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">AI Job Fit Scanner</h3>
        <div>
          <button id="aa-minimize-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px; padding: 0 8px;">_</button>
          <button id="aa-close-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 0 8px; line-height: 1;">×</button>
        </div>
      </div>
    `;

    const contentHtml = `
      <div id="aa-sidebar-content" style="padding: 16px; overflow-y: auto; flex: 1; background-color: #f8fafc;">
        ${jobs.map(job => {
          let scoreColor = '#ef4444';
          let scoreBg = '#fee2e2';
          if (job.score >= 75) {
            scoreColor = '#10b981';
            scoreBg = '#d1fae5';
          } else if (job.score >= 50) {
            scoreColor = '#f59e0b';
            scoreBg = '#fef3c7';
          }

          const safeTitle = escapeFloatingHTML(job.title);
          const safeCompany = escapeFloatingHTML(job.company);
          const safeReason = escapeFloatingHTML(job.reason);

          return \`
            <div style="background: white; border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; font-size: 14px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="\${safeTitle}">
                    \${safeTitle}
                  </div>
                  <div style="font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="\${safeCompany}">
                    \${safeCompany}
                  </div>
                </div>
                <div style="margin-left: 12px; background: \${scoreBg}; color: \${scoreColor}; font-weight: bold; font-size: 14px; padding: 4px 8px; border-radius: 6px;">
                  \${job.score}
                </div>
              </div>
              <div style="font-size: 13px; color: #475569; line-height: 1.4;">
                \${safeReason}
              </div>
              \${job.link ? \`<div style="margin-top: 8px; text-align: right;"><a href="\${job.link}" target="_blank" style="font-size: 13px; color: #2563eb; text-decoration: none; font-weight: 500; padding: 4px 8px; border-radius: 4px; border: 1px solid #bfdbfe; background: #eff6ff;">View Job ↗</a></div>\` : ''}
            </div>
          \`;
        }).join('')}
      </div>
    `;

    sidebar.innerHTML = headerHtml + contentHtml;

    let minimized = false;
    document.getElementById('aa-minimize-btn').addEventListener('click', () => {
      const content = document.getElementById('aa-sidebar-content');
      if (minimized) {
        content.style.display = 'block';
        sidebar.style.width = '350px';
      } else {
        content.style.display = 'none';
        sidebar.style.width = '200px';
      }
      minimized = !minimized;
    });

    document.getElementById('aa-close-btn').addEventListener('click', () => {
      sidebar.remove();
    });
  }

  function escapeFloatingHTML(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
