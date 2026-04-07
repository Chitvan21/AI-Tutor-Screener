# AI Tutor Screener
A fully voice-driven AI interviewer that screens tutor candidates for Cuemath. Candidates speak with **Maya**, an AI interviewer, who asks structured questions and assesses their teaching ability. After the interview, an AI-generated assessment report is produced with scores across 5 dimensions and a hire/reject recommendation.

## What it does

- Maya greets the candidate and conducts a 5-question voice interview
- Candidate answers are transcribed in real time using Groq Whisper
- Maya's responses are spoken aloud using Sarvam AI's Bulbul TTS
- At the end, a detailed assessment report is generated using Claude — with scores, evidence quotes, strengths, and a recommendation

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| AI Interviewer | Anthropic Claude (`claude-sonnet-4-5`) |
| Speech-to-Text | Groq Whisper (`whisper-large-v3`) |
| Text-to-Speech | Sarvam AI Bulbul (`bulbul:v3`) |

## Environment Variables

Create a `.env` file inside the `backend/` folder:

```
ANTHROPIC_API_KEY=your-key-here
GROQ_API_KEY=your-key-here
SARVAM_API_KEY=your-key-here
```

## Running Locally

### Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

Runs at `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`

Open the frontend in your browser, click **Start Interview**, and speak with Maya.
