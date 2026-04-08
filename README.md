# AutoApply — AI-Powered Job Application Filler

A Chrome extension that automatically fills job application forms using your profile, with AI-generated cover letters and tailored answers powered by Claude.

## Features

- **One-click form filling** on LinkedIn Easy Apply, Indeed, Greenhouse, Lever, Workday, Jobvite, and more
- **Resume PDF import** — upload your resume and auto-populate your profile
- **AI cover letter generation** — Claude writes a tailored cover letter for each job based on the job description
- **AI-powered open-ended answers** — "Why do you want to work here?", strengths, growth areas, and more
- **Profile completeness tracker** — see how complete your profile is at a glance
- **Fill history** — log of every application you've auto-filled

## Supported Sites

| Platform | Status |
|---|---|
| LinkedIn Easy Apply | ✅ |
| Indeed | ✅ |
| Greenhouse | ✅ |
| Lever | ✅ |
| Workday | ✅ |
| Jobvite | ✅ |
| SmartRecruiters | ✅ |
| iCIMS | ✅ |
| Taleo | ✅ |
| Ashby | ✅ |
| Generic forms | ✅ |

## Installation (Developer Mode)

1. Clone this repo:
   ```bash
   git clone https://github.com/yourusername/auto-apply-extension.git
   ```

2. Open Chrome and go to `chrome://extensions`

3. Enable **Developer Mode** (toggle in the top right)

4. Click **Load unpacked** and select the `auto-apply-extension` folder

5. The AutoApply icon will appear in your Chrome toolbar

## Setup

1. Click the AutoApply icon → **Edit Profile**
2. Either:
   - Upload your resume PDF to auto-populate your profile, or
   - Manually fill in your personal info, work history, education, and skills
3. Go to **AI Settings** and add your [Claude API key](https://console.anthropic.com) for AI-powered filling
4. Navigate to a job application and click **Fill Application**

## Getting a Claude API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)
4. Paste it in AutoApply → AI Settings

Your API key is stored locally in Chrome storage and never sent anywhere except Anthropic's API.

## Project Structure

```
auto-apply-extension/
├── manifest.json          # Chrome extension manifest (MV3)
├── popup.html             # Extension popup UI
├── options.html           # Profile settings page
├── icons/                 # Extension icons
└── src/
    ├── popup.js           # Popup UI logic
    ├── options.js         # Profile management
    ├── content.js         # Form detection & filling (injected into pages)
    ├── background.js      # Service worker (AI API calls, history)
    └── resume-parser.js   # PDF resume text extraction & parsing
```

## How It Works

1. **Content script** (`content.js`) is injected into every page and listens for a fill command
2. When you click **Fill Application**, the popup sends a message to the content script with your profile data
3. The content script scans all form inputs, identifies each field using label/name/placeholder heuristics, and fills matched fields
4. If **AI Mode** is on, the background service worker calls the Claude API to generate a tailored cover letter and answers to open-ended questions
5. Fill events are logged to local storage for history tracking

## Contributing

Issues and PRs welcome! If a site isn't filling correctly, please open an issue with the URL and a description of what went wrong.

## Privacy

- All profile data is stored locally in Chrome's `storage.local`
- Your API key is stored locally and only used to call Anthropic's API
- No data is sent to any third-party server

## License

MIT
