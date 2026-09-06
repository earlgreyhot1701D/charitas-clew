# 🌊 Charitas Clew | Public Rights & Paperwork Sanctuary

> **DEV Weekend Challenge Entry (Generosity & Public Good)**  
> **Built 100% with Google Tech Stack:** Google Gemini 1.5 Flash • Google Cloud Run • Firebase Hosting  
> **Live App:** [https://charitas-clew.web.app](https://charitas-clew.web.app)

> [!IMPORTANT]
> **⚖️ Legal Advisement & Educational Self-Advocacy Notice:**  
> Charitas Clew provides automated educational information and self-advocacy guidance only. It does **not** provide formal legal advice or legal representation. Please review all generated scripts, key dates, and summaries, and verify document details with a qualified legal aid advocate, caseworker, or attorney before taking formal legal action.

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

**Charitas Clew** is a zero-judgment, mobile-first public rights sanctuary that works with **ANY official document, legal notice, government letter, or billing statement**.

Whether a user pastes text or uploads a camera photo/PDF scan of any official letter:

- **Plain-English Deconstruction**: Strips jargon and explains what the letter actually demands.
- **Timeline Analysis**: Identifies whether a hard deadline exists or if it's informational.
- **Step-by-Step Guidance**: Provides 2–3 actionable, reassuring next steps.
- **Tailored Speaking Script**: Generates a custom 2–3 sentence phone/in-person script customized for that specific document so the user knows exactly what to say to the clerk, representative, or caseworker.

---

### 🌟 Key Capabilities & Features

1. **Universal Multimodal Input (Text or Photo/Scan)**:
   - Accepts text pastes or direct smartphone camera uploads (JPG, PNG, WEBP, HEIC, PDF) for any official document.
2. **Mobile Native Share & Audio**:
   - **📲 Share / Print**: 1-tap mobile share (SMS, WhatsApp, Apple Notes, Email) via Web Share API (`navigator.share`), plus clean PDF print formatting.
   - **🔊 Speech TTS**: 1-tap audio synthesis so users can listen to their speaking script while waiting in line.
3. **1-Tap Emergency Assistance**:
   - Direct `tel:211` 1-tap dialing for immediate housing/utility crisis support, HUD counseling, and legal aid locator.
4. **Sanctuary Persistence & Privacy**:
   - Automatic `localStorage` persistence (`✨ Restore Last Sanctuary Notice`) so phone screen locks or page reloads don't erase output.

---

## ⚡ Built With Google Forward (100% Google Stack End-to-End)

Charitas Clew was conceived, architected, built, and deployed using a 100% Google Stack:

```
[ Gemini Chat Ideation ] ──(Planning & Prompts)──> [ Antigravity IDE / Gemini 1.5 Flash ]
                                                                   │
[ User Smartphone / Web App ] ──(HTTPS)──> [ Firebase Hosting CDN ]
                                                   │
                                            (Express Gateway)
                                                   │
                                           [ Google Cloud Run ]
                                                   │
                                    [ Google Gemini 1.5 Flash API ]
```

* **Google Gemini Chat Ideation**: Project ideation, problem formulation, persona design, legal advisement wording, and multimodal prompt engineering ([View Public Chat Session](https://gemini.google.com/app/b6b9f7e87d389357)).
* **Google Gemini 1.5 Flash (`@google/genai` SDK)**: Powers multimodal document OCR, structured JSON extraction, and sanctuary-toned translation.
* **Google Cloud Run**: Containerized Node.js Express backend (`Dockerfile`) deployed on port 8080.
* **Google Firebase Hosting**: Ultra-fast static frontend delivery and global CDN (`charitas-clew.web.app`).

---

## 🛡️ Security & Resilience Hardening

- **Prompt Injection Guard**: Regex filters strip control characters and block prompt-hijacking attempts (`ignore instructions`, `jailbreak`, etc.).
- **XML System Isolation**: User text is wrapped in strict `<document_content>` blocks with system prompts enforcing untrusted data boundaries.
- **Payload & Rate Limiting**: Express body parser capped at 10MB; API protected by rate limiting (15 req / 15 min per IP).
- **Graceful EOL Sunset**: Built-in offline fallback displaying 211 and legal aid resources if backend connectivity is unavailable.

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
git clone https://github.com/earlgreyhot1701d/Clew-Labs.git
cd charitas
npm install

# 2. Configure environment
echo "GEMINI_API_KEY=your_api_key_here" > .env

# 3. Start local development engine
npm start
# Open http://localhost:8080 in browser
```
