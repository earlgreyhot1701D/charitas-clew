# 🌊 Charitas Clew | Public Rights & Paperwork Engine

> **DEV Weekend Challenge Entry (Generosity & Public Good)**
> **Built 100% with Google Tech Stack:** Google Gemini Flash • Google Cloud Run • Firebase Hosting
> **Live App:** [https://charitas-clew.web.app](https://charitas-clew.web.app)

> [!IMPORTANT]
> **⚖️ Legal Advisement & Educational Self-Advocacy Notice:**
> Charitas Clew provides automated educational information and self-advocacy guidance only. It does **not** provide formal legal advice or legal representation. Please review all generated scripts, key dates, and summaries, and verify document details with a qualified legal aid advocate, caseworker, or attorney before taking formal legal action.

---

## 🏆 Hackathon Submission Snapshot & Post-Submission Log

> [!NOTE]
> **Notice to Judges:**
> The original hackathon entry submitted to the DEV Weekend Challenge at the September 6, 2026 deadline is permanently preserved in git at tag:
> [`hackathon-submission-2026-09-06`](https://github.com/earlgreyhot1701D/charitas-clew/releases/tag/hackathon-submission-2026-09-06).
>
> Commits and improvements made after that tag represent post-submission production hardening, reliability, security, testing, accessibility, and resilience enhancements. They are not represented as work completed during the initial challenge window, but rather ongoing software craftsmanship to guarantee zero-downtime reliability during judging and real-world public use:
> - **Gemini Fallback & Timeout Tuning**: migrated primary and fallback models to `gemini-3.6-flash` and `gemini-flash-lite`. Expanded attempt timeout to 24s within a 45s provider budget (comfortably below Firebase Hosting's 60s gateway cutoff).
> - **Permissive Runtime Response Sanitization**: Relaxed strict JSON validation to safely strip benign extra fields, discard control characters, and clamp oversized strings/arrays. If Gemini flags a deadline without a specific date or context, safe neutral context text is provided instead of returning a 502 error.
> - **ISO Language Code Normalization**: Supported ISO codes (`en`, `es`, `vi`, `zh`, `ar`, `fr`) and uppercase variants alongside display names.
> - **One-Tap Preset Deconstruction**: Selecting any sample notice immediately clears stale data and triggers instant deconstruction with visual loading states.
> - **Deterministic Container Builds**: Standardized Dockerfile on `npm ci --omit=dev`.
> - **Exhaustive Regression Suite**: Expanded unit and integration test coverage across all resilience boundaries, proxy trusts, and privacy invariants.

---

## 🚨 The Problem

Every single day, thousands of vulnerable individuals, low-income families, seniors, and non-native English speakers receive dense, overwhelming official paperwork in the mail:

- **3-Day Notices to Pay Rent or Quit (Eviction Warnings)**
- **Final Utility Disconnect Notices**
- **SNAP & Medicaid Benefit Recertification Deadlines**
- **Court Appearance Summonses & Legal Demands**
- **Hospital Bills & Insurance Coverage Denials**
- **IRS / State Tax Agency Letters & Wage Garnishments**
- **HOA Violation Notices & Municipal Citations**

These documents are formatted in dense, opaque legalese. The results are devastating:
1. **Confusion & Paralysis**: Recipients panic, freeze up, or miss critical deadlines because the language feels complex and unreadable.
2. **Communication Barriers**: People don't know *what* the document actually demands, *when* the real deadline is, or *what to say* when calling a clerk, representative, or caseworker.
3. **Preventable Loss**: Families lose housing, medical care, or food assistance simply because they couldn't decipher opaque government, landlord, or billing paperwork in time.

---

## 🛡️ The Solution: Charitas Clew

**Charitas Clew** is a zero-judgment, mobile-first paperwork engine that works with **ANY official document, legal notice, government letter, or billing statement**.

> [!NOTE]
> **📱 Mobile-First Design Intent:**
> Charitas Clew is purpose-built to be **mobile-first**, optimized specifically for smartphone screens in physical waiting rooms, courthouse hallways, and emergency situations. When viewed on wide desktop monitors, the interface intentionally maintains a centered, focused mobile column rather than stretching across wide viewports.

Whether a user pastes text or uploads a camera photo/PDF scan of any official letter:

- **Plain-English Deconstruction**: Strips jargon and explains what the letter actually demands.
- **Timeline Analysis**: Identifies whether a hard deadline exists or if it's informational.
- **Step-by-Step Guidance**: Provides 2–3 actionable, reassuring next steps.
- **Tailored Speaking Script**: Generates a custom 2–3 sentence phone/in-person script customized for that specific document so the user knows exactly what to say to the clerk, representative, or caseworker.

---

### 🌟 Key Capabilities & Features

1. **Universal Multimodal Input (Text or Photo/Scan)**:
   - Accepts text pastes or direct smartphone camera uploads (JPG, PNG, WEBP, HEIC, PDF) for any official document.
2. **Six-Language Output**:
   - Full deconstruction, deadlines, action steps, and speaking script render in English, Spanish, Vietnamese, Chinese, Arabic, or French (with ISO code normalization).
3. **Mobile Native Share & Audio**:
   - **📲 Share / Print**: 1-tap mobile share (SMS, WhatsApp, Apple Notes, Email) via Web Share API (`navigator.share`), plus clean PDF print formatting.
   - **🔊 Speech TTS**: 1-tap audio synthesis so users can listen to their speaking script while waiting in line.
4. **1-Tap Emergency Assistance**:
   - Direct `tel:211` 1-tap dialing for immediate housing/utility crisis support, HUD counseling, and legal aid locator.
5. **Session Privacy & Ephemeral Processing**:
   - Notice content is processed in memory for the active session and is not saved in persistent browser storage (`localStorage`), protecting users on shared or public devices. Harmless preferences (such as language choice) may remain on device.

---

## ⚡ Built With Google Forward (100% Google Stack End-to-End)

Charitas Clew was conceived, architected, built, and deployed using a 100% Google Stack:

```
[ Gemini Chat Ideation ] ──(Planning & Prompts)──> [ Antigravity IDE / Gemini Flash ]
                                                                   │
[ User Smartphone / Web App ] ──(HTTPS)──> [ Firebase Hosting CDN ]
                                                   │
                                            (Express Gateway)
                                                   │
                                           [ Google Cloud Run ]
                                                   │
                                      [ Google Gemini Flash API (`gemini-3.6-flash`) ]
```

* **Google Gemini Chat Ideation**: Project ideation, problem formulation, persona design, legal advisement wording, and multimodal prompt engineering ([View Public Chat Session](https://gemini.google.com/app/b6b9f7e87d389357)).
* **Google Gemini Flash (`@google/genai` SDK & `gemini-3.6-flash`)**: Powers multimodal document OCR, structured JSON extraction, and plain-language translation in a calm register with fallback to `gemini-2.5-flash-lite`.
* **Google Cloud Run**: Containerized Node.js Express backend (`Dockerfile`) deployed on port 8080.
* **Google Firebase Hosting**: Ultra-fast static frontend delivery and global CDN (`charitas-clew.web.app`).

---

## 🛡️ Security & Resilience Hardening

- **Untrusted Document Isolation**: Document contents are treated as untrusted data and isolated from application-controlled instructions within `<untrusted_document>` delimiters. Model output is constrained by schema and validated at runtime before display.
- **Backend Model Failover & Timeouts**: Server executes up to 2 attempts per model with a fixed 1000ms backoff across candidate Flash models (`gemini-3.6-flash` and `gemini-flash-lite`). Each attempt receives up to 24s within a 45s overall provider budget, safely below Firebase Hosting's 60s gateway limit.
- **Resilient Response Validation**: Structured JSON schema output is sanitized at runtime: unknown fields are safely discarded, control characters are removed, and text fields/action steps are clamped rather than rejecting successful model inferences. If Gemini flags a deadline without a calendar date or context, safe neutral context text is provided instead of returning an unnecessary 502 error.
- **Transient vs Permanent Failure Handling**: Transient provider issues (HTTP 429 rate limits, 503 unavailability, network timeouts) trigger automatic retries. Permanent client/auth/safety errors fail immediately without retry. The client UI distinguishes transient retryable network/server issues from the scheduled permanent calendar sunset (`2027-01-01`).
- **Payload & Rate Limiting**: Express body parser capped at 10MB. Rate limiting of 15 requests per 15 minutes per IP is enforced at the Cloud Run service behind trusted Google proxy hops.
- **Server-Side Credential Isolation**: The Gemini API key is stored in Google Secret Manager and injected into the Cloud Run container at runtime. No key is ever present in client-served files, and the browser never calls the Gemini API directly.
- **Graceful EOL Sunset**: Activates 211 emergency legal aid handoff upon hardcoded sunset date (`2027-01-01`).

---

## 👤 Author & Project Links

Created by **La-Shara Cordero** for the DEV Weekend Challenge.

* **Live App**: [https://charitas-clew.web.app](https://charitas-clew.web.app)
* **Google Gemini Chat Ideation Session**: [https://gemini.google.com/app/b6b9f7e87d389357](https://gemini.google.com/app/b6b9f7e87d389357)
* **DEV Community Profile**: [https://dev.to/earlgreyhot1701d](https://dev.to/earlgreyhot1701d)
* **Clew Labs Project**: [https://earlgreyhot1701d.github.io/Clew-Labs/](https://earlgreyhot1701d.github.io/Clew-Labs/)
* **LinkedIn Profile**: [https://www.linkedin.com/in/la-shara-cordero-a0017a11/](https://www.linkedin.com/in/la-shara-cordero-a0017a11/)

---

## 🚀 Local Setup & Running

```bash
# 1. Clone & install dependencies
git clone https://github.com/earlgreyhot1701D/charitas-clew.git
cd charitas-clew
npm install

# 2. Configure environment
echo "GEMINI_API_KEY=your_api_key_here" > .env

# 3. Start local development engine
npm start
# Open http://localhost:8080 in browser
```

---

## 📦 Production Deployment & Verification Runbook

All production builds use immutable, Git commit-derived SHA container tags deployed to Artifact Registry and Cloud Run.

```bash
# 1. Identify current commit SHA
COMMIT_SHA=$(git rev-parse --short HEAD)
REGION="us-central1"
PROJECT_ID="charitas-clew"
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/charitas-clew/server:${COMMIT_SHA}"

# 2. Build & push container image to Artifact Registry
gcloud builds submit --tag "${IMAGE}" .

# 3. Deploy revision to Google Cloud Run with Secret Manager injection
gcloud run deploy charitas-clew-server \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=60s

# 4. Verify Cloud Run revision health & proxy trust
SERVICE_URL=$(gcloud run services describe charitas-clew-server --region "${REGION}" --format='value(status.url)')
curl -fsS "${SERVICE_URL}/"

# 5. Deploy Firebase Hosting static assets & rewrite rules
firebase deploy --only hosting

# 6. End-to-end hosted API probe (verifying live deconstruction pipeline)
curl -sS -X POST "https://charitas-clew.web.app/api/deconstruct" \
  -H "Content-Type: application/json" \
  -d '{"text":"Final Notice: Your electric service is scheduled for disconnection on October 15, 2026 due to past due balance. Call 1-800-555-0199 immediately.","targetLanguage":"English"}'
```
