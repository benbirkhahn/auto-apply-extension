// content.js — injected into every page, handles form detection and filling

(function () {
  'use strict';

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
      sendResponse({ detected, url: window.location.href });
      return true;
    }
  });

  // ─── Form Detection ───────────────────────────────────────────────────────

  function detectFormOnPage() {
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
    return inputs.length > 2;
  }

  function getSiteKey() {
    const host = window.location.hostname.replace('www.', '');
    return Object.keys(SITE_SELECTORS).find(k => host.includes(k));
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
    // Try preceding sibling/parent text
    const parent = el.parentElement;
    if (parent) {
      const text = Array.from(parent.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .join(' ');
      if (text) return text;
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
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
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

})();
