# AI Tutor Screener
### Built for the Cuemath AI Builder Challenge

A voice-powered AI interviewer that screens tutor candidates through natural conversation and generates structured assessment reports.

---

## Live Demo
[cuemath-tutor-screener.vercel.app](https://cuemath-tutor-screener.vercel.app)

> Note: First load may take 20-30 seconds as the server wakes up from sleep (free tier cold start).

---

## What It Does
- Recruiters sign in with email/password — interviews and reports are saved to their account
- Maya, an AI interviewer, conducts a full voice screening interview with tutor candidates
- Candidates speak naturally — their voice is transcribed in real time
- Maya adapts her questions based on responses, follows up on vague answers, and handles edge cases (Hindi responses, one-word answers, rambling)
- After the interview, generates a structured assessment report with scores across 5 dimensions and direct quotes as evidence
- Reports are automatically saved to Supabase and viewable in the recruiter dashboard
- Recruiters can review all past interviews from the dashboard, expand any card for full detail, and download reports as text files

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| Auth & Database | Supabase |
| Conversation AI | Claude claude-sonnet-4-5 (Anthropic) |
| Speech to Text | Whisper Large v3 (Groq) |
| Text to Speech | Bulbul v3 (Sarvam AI) |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Assessment Dimensions
Maya evaluates candidates across 5 dimensions:
- **Communication Clarity** — Can they explain things simply?
- **Warmth & Patience** — Do they sound kind and encouraging?
- **Ability to Simplify** — Can they break down complex ideas?
- **Handling Difficulty** — How do they respond to stuck students?
- **English Fluency** — Is their spoken English clear?

Each dimension is scored 1–5 with direct quotes from the conversation as evidence.

---

## Running Locally

### Prerequisites
- Python 3.9+
- Node.js 18+
- API keys for: Anthropic, Groq, Sarvam AI

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Add your API keys to .env
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
Create `backend/.env` with:
```
ANTHROPIC_API_KEY=your_key
GROQ_API_KEY=your_key
SARVAM_API_KEY=your_key
```

---

## Key Design Decisions

**Why voice-first?**
Real tutoring happens through speech. A voice interface better reflects how candidates will actually teach, and reveals communication quality that text cannot.

**Why Claude for conversation?**
Claude's ability to follow nuanced instructions makes Maya feel natural — she adapts, follows up, and wraps up gracefully without rigid scripting.

**Why Sarvam AI for TTS?**
Sarvam's Bulbul model produces Indian-accented English voices. Since Cuemath's tutors are predominantly Indian, Maya sounds familiar and professional to them — not foreign.

**Why Groq for STT?**
Groq's LPU hardware runs Whisper Large v3 significantly faster than standard GPU inference, reducing transcription latency and keeping the conversation flow natural.

**Why Supabase (PostgreSQL) for persistence?**
Interviews and assessment reports are automatically saved to a PostgreSQL database via Supabase after each session. Recruiters log in with email/password auth and access a dashboard showing all past interviews — candidate name, recommendation badge, per-dimension scores, and evidence quotes — without any manual export step.

---

## What I'd Improve With More Time
- Fine-tune Maya's questions for specific Cuemath grade levels (primary vs secondary)
- Add a confidence score based on voice analysis (pace, hesitation, filler words)
- Reduce cold start with a paid Render tier or keep-alive pings

---

## Author
Built by Chitvan | [GitHub](https://github.com/Chitvan21)
