import os
import asyncio
import logging
import base64
import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from groq import Groq
import anthropic
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

groq_api_key = os.getenv("GROQ_API_KEY")
if not groq_api_key:
    raise RuntimeError("GROQ_API_KEY is not set in .env")

anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
if not anthropic_api_key:
    raise RuntimeError("ANTHROPIC_API_KEY is not set in .env")

sarvam_api_key = os.getenv("SARVAM_API_KEY")
if not sarvam_api_key:
    raise RuntimeError("SARVAM_API_KEY is not set in .env")

groq_client = Groq(api_key=groq_api_key)
anthropic_client = anthropic.Anthropic(api_key=anthropic_api_key)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {"status": "ok", "message": "AI Tutor Screener API is running"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        response = groq_client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=(file.filename or "audio.webm", audio_bytes),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"text": response.text}


class SpeakRequest(BaseModel):
    text: str


@app.post("/speak")
async def speak(body: SpeakRequest):
    log.info("POST /speak — %d chars", len(body.text))
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.sarvam.ai/text-to-speech",
                headers={"api-subscription-key": sarvam_api_key},
                json={
                    "inputs": [body.text],
                    "target_language_code": "en-IN",
                    "speaker": "priya",
                    "model": "bulbul:v3",
                    "audio_format": "wav",
                    "speech_sample_rate": 24000,
                    "pace": 1.05,
                },
            )
        if r.status_code != 200:
            log.error("Sarvam TTS error %s: %s", r.status_code, r.text)
            raise HTTPException(status_code=r.status_code, detail=f"Sarvam TTS error: {r.text}")
        audio_b64 = r.json()["audios"][0]
        audio_bytes = base64.b64decode(audio_b64)
        log.info("Sarvam TTS succeeded, %d bytes", len(audio_bytes))
        return Response(content=audio_bytes, media_type="audio/wav")
    except httpx.RequestError as e:
        log.error("Sarvam TTS connection error: %s", e)
        raise HTTPException(status_code=503, detail=f"Could not reach Sarvam API: {e}")


MAYA_SYSTEM_PROMPT = """You are Maya, a warm and professional AI interviewer for Cuemath, screening tutor candidates.
Your goal is to assess whether a candidate has the right qualities to teach math to children aged 6-16.

You are evaluating them on 5 dimensions:
- Communication clarity: Can they explain things simply and clearly?
- Warmth and patience: Do they sound kind, calm, and encouraging?
- Ability to simplify: Can they break down complex ideas for a child?
- Handling difficulty: How do they respond when a student is stuck or frustrated?
- English fluency: Is their spoken English clear and confident?

Interview structure:
- Start by warmly welcoming the candidate and asking them to introduce themselves briefly
- Ask 4-5 questions total, one at a time
- Always wait for their answer before asking the next question
- If an answer is vague or too short, ask one follow-up before moving on
- Good questions to ask:
  * "Can you explain what a fraction is to a 9-year-old who has never heard the word before?"
  * "A student has been staring at a problem for 5 minutes and says they give up. What do you do?"
  * "What do you think makes a great math tutor?"
  * "Tell me about a time you explained something difficult to someone. How did you make it simple?"
- After 4-5 exchanges, naturally wrap up the interview by thanking them and telling them the assessment will be shared shortly
- Never ask more than one question at a time
- Never sound robotic — be warm, natural, conversational
- Keep your responses concise — 2-3 sentences max per turn

Handling edge cases:
- Short answers: If a candidate gives a one-word or very short answer (under 10 words), do not move to the next question. Instead gently encourage more detail with a prompt like "Could you tell me a bit more about that?" or "That's interesting — can you walk me through your thinking?" Do this maximum once per question before moving on.
- Hindi or Hinglish: If the candidate responds in Hindi or Hinglish, acknowledge it warmly and respond in English, gently noting that Cuemath interviews are conducted in English. Do not penalise them — just smoothly redirect.
- Rambling answers: If a candidate gives a very long answer (clearly rambling), acknowledge one strong point from what they said and redirect with the next question. Do not let the conversation stall.
- "I don't know" responses: If a candidate says "I don't know" or "I'm not sure", do NOT provide the correct answer or coach them. Instead acknowledge it briefly ("That's okay, these situations can be tricky") and move to the next question. The interview must assess their actual knowledge, not their ability to learn from your hints.
- Closing: When you have asked all your questions and are ready to close, always include the phrase "best of luck" in your closing message. This is important for the system to detect the interview has ended."""


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    session_id: str
    messages: list[Message]


@app.get("/chat")
def chat_get():
    return {"message": "Use POST to this endpoint"}


@app.post("/chat")
async def chat(body: ChatRequest):
    print("=== /chat endpoint hit ===")
    msgs = (
        [{"role": m.role, "content": m.content} for m in body.messages]
        or [{"role": "user", "content": "Hello"}]
    )

    log.info("POST /chat — %d message(s), session=%s", len(msgs), body.session_id)

    last_error = None
    for attempt in range(4):
        try:
            log.info("Calling Anthropic API (attempt %d)…", attempt + 1)
            response = anthropic_client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=512,
                system=MAYA_SYSTEM_PROMPT,
                messages=msgs,
            )
            log.info("Anthropic API call succeeded on attempt %d", attempt + 1)
            return {"response": response.content[0].text}

        except anthropic.APIStatusError as e:
            log.error("Anthropic APIStatusError (attempt %d): status=%s body=%s", attempt + 1, e.status_code, e.message)
            if e.status_code == 529:
                last_error = e
                wait = 2 ** attempt
                log.info("Overloaded — retrying in %ds…", wait)
                await asyncio.sleep(wait)
                continue
            raise HTTPException(status_code=e.status_code, detail=e.message)

        except anthropic.APIConnectionError as e:
            log.error("Anthropic connection error (attempt %d): %s", attempt + 1, e)
            raise HTTPException(status_code=503, detail=f"Could not reach Anthropic API: {e}")

        except Exception as e:
            log.exception("Unexpected error calling Anthropic (attempt %d)", attempt + 1)
            raise HTTPException(status_code=500, detail=str(e))

    log.error("All retry attempts exhausted. Last error: %s", last_error)
    raise HTTPException(status_code=503, detail="Anthropic is overloaded — please try again in a moment.")


ASSESS_SYSTEM_PROMPT = """You are an expert hiring assessor for Cuemath, evaluating tutor candidates based on a screening interview transcript.

Analyze the conversation and return a JSON assessment with exactly this structure:
{
  "candidate_name": "extracted from conversation",
  "recommendation": "SHORTLIST" or "REJECT" or "MAYBE",
  "recommendation_reason": "one sentence explaining why",
  "scores": {
    "communication_clarity": { "score": 1-5, "evidence": "direct quote from conversation" },
    "warmth_and_patience": { "score": 1-5, "evidence": "direct quote from conversation" },
    "ability_to_simplify": { "score": 1-5, "evidence": "direct quote from conversation" },
    "handling_difficulty": { "score": 1-5, "evidence": "direct quote from conversation" },
    "english_fluency": { "score": 1-5, "evidence": "direct quote from conversation" }
  },
  "overall_summary": "2-3 sentence summary of the candidate",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "areas_to_probe": ["area 1", "area 2"],
  "interview_quality": "note on whether the interview had enough substance to assess accurately"
}

Be honest and critical. Not every candidate should be shortlisted.
Base every score on specific evidence from the transcript.
Return ONLY valid JSON — no preamble, no markdown, no backticks.
You must always respond with valid JSON. Never return an empty response. If the transcript is too short to assess, return the JSON structure with low scores and note it in interview_quality."""


class AssessRequest(BaseModel):
    messages: list[Message]


ASSESS_FALLBACK = {
    "candidate_name": "Candidate",
    "recommendation": "MAYBE",
    "recommendation_reason": "Could not parse full assessment",
    "scores": {
        "communication_clarity": {"score": 3, "evidence": "N/A"},
        "warmth_and_patience":   {"score": 3, "evidence": "N/A"},
        "ability_to_simplify":   {"score": 3, "evidence": "N/A"},
        "handling_difficulty":   {"score": 3, "evidence": "N/A"},
        "english_fluency":       {"score": 3, "evidence": "N/A"},
    },
    "overall_summary": "Assessment could not be generated. Please review the transcript manually.",
    "strengths": [],
    "areas_to_probe": [],
    "interview_quality": "Parse error",
}


@app.post("/assess")
async def assess(body: AssessRequest):
    import json

    # Build a plain transcript string so Claude acts as a fresh assessor,
    # not as a continuation of Maya's conversation.
    transcript = ""
    for m in body.messages:
        label = "CANDIDATE" if m.role == "user" else "INTERVIEWER (Maya)"
        transcript += f"{label}: {m.content}\n\n"

    log.info("POST /assess — transcript is %d chars across %d messages", len(transcript), len(body.messages))

    raw = None
    try:
        response = anthropic_client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1500,
            temperature=0,
            system=ASSESS_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Please assess this interview transcript:\n\n{transcript}"}],
        )

        if not response.content:
            log.error("Claude returned empty content. stop_reason=%s", response.stop_reason)
            return ASSESS_FALLBACK

        raw = response.content[0].text
        log.info("Raw Claude response (%d chars):\n%s", len(raw), raw)

        # Strip markdown code fences
        stripped = raw.strip()
        if stripped.startswith("```"):
            stripped = stripped.split("```")[1]
            if stripped.startswith("json"):
                stripped = stripped[4:]
        stripped = stripped.strip()

        report = json.loads(stripped)
        log.info("Assessment parsed successfully for: %s", report.get("candidate_name", "unknown"))
        return report

    except json.JSONDecodeError as e:
        log.error("JSON parse error: %s\nRaw response was:\n%s", e, raw)
        return ASSESS_FALLBACK
    except Exception as e:
        log.exception("Assessment generation failed")
        return ASSESS_FALLBACK
