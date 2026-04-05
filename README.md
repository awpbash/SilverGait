# SilverGait

A **multimodal agentic system** for at-home elderly frailty assessment and management in Singapore. Click [here](https://silvergait.onrender.com) for demo!

<p align="center">
  <img src="demo/hero/chat.png" width="27%" />
  &nbsp;
  <img src="demo/hero/scoring.png" width="27%" />
  &nbsp;
  <img src="demo/hero/caregiver.png" width="27%" />
</p>

## Problem

Singapore is one of the fastest-ageing societies in Asia. Among community-dwelling seniors aged 65+, **6.2% are frail and 37% are pre-frail** -- most unaware of their status until a fall or hospitalisation occurs. Clinical assessments like the SPPB require in-person visits with trained professionals, making regular screening impractical.

As AI-driven healthcare gains momentum in Singapore ([NUS-Synapxe-IMDA AI Innovation Challenge 2026](https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/press-releases/2026/ai-solutions-combating-chronic-diseases)), there is a clear need for tools that enable **continuous remote monitoring** and **empower patients to manage their health from home**.

## Solution

SilverGait enables elderly users to perform standardized **SPPB assessments at home** using only a smartphone camera -- no wearables or clinic visits required. The system combines **computer vision**, **deterministic clinical scoring**, and a **multilingual agentic chat system** to deliver continuous, personalized frailty management.

**Modalities:** Video (pose estimation + vision LLM), voice (STT/TTS in 4 languages), text (chat agent), structured health data (Katz ADL, CFS, SPPB)

### Key Features

- **Video-based SPPB** -- MoveNet extracts 2D kinematics on-device; Gemini Vision scores balance, gait, and chair-stand tests (0-12)

  <p align="center"><img src="demo/cv.png" width="32%" /></p>
- **Deterministic frailty pipeline** -- Katz ADL + CFS + SPPB feed a rule-based classifier (0 LLM calls). Tier changes auto-generate care plans and caregiver alerts
- **Agentic chat** -- Gemini 2.5 Flash orchestrator dispatches to Exercise, Sleep, Education, and Monitoring sub-agents via function calling
- **Caregiver voice cloning** -- ElevenLabs clones a familiar voice for all TTS output

  <p align="center"><img src="demo/voice.png" width="32%" /></p>
- **Multilingual voice-first** -- English, Mandarin, Malay, Tamil. MERaLiON AudioLLM handles Singlish accents
- **Personalized plans** -- Exercise plans by frailty tier; Sleep Agent generates CBT-I plans
- **Elderly-optimized UI** -- 18px+ fonts, 48px+ touch targets, high-contrast warm palette, voice on all screens

  <p align="center"><img src="demo/wearables.png" width="32%" /></p>

## Architecture

```
Assessment Graph (0 LLM calls)          Chat Graph (1-5 LLM calls)
Score -> Classify -> Tier Change?       Context Assembly -> Agent (Gemini)
  YES -> Update Plans -> Notify             | function_call |
  NO  -> Persist                        Exercise / Sleep / Education / Monitoring
         | writes DB                    Progress Summary / Alert Caregiver
         +----------> Database <--------    -> Safety Gate -> Persist
```

**LLM only where reasoning is needed.** Scoring, classification, routing, and plan selection are fully deterministic.

## Documentation

Browse the **[documentation site](https://awpbash.github.io/SilverGait/)** for detailed specs:

| Page | Description |
|------|-------------|
| [LangGraph Diagrams](https://awpbash.github.io/SilverGait/langgraph-diagrams.html) | Interactive flow diagrams of both pipelines |
| [System Architecture](https://awpbash.github.io/SilverGait/architecture.html) | Node-level specs, state schemas, DB schema |
| [Kinematics & SPPB](https://awpbash.github.io/SilverGait/kinematics.html) | CV pipeline, pose estimation, scoring algorithms |
| [Clinical Evidence](https://awpbash.github.io/SilverGait/research.html) | 35+ peer-reviewed papers backing each design decision |

## Quick Start

**Prerequisites:** Python 3.10+, Node.js 18+ (with pnpm), [Gemini API key](https://aistudio.google.com/app/apikey)

```bash
git clone https://github.com/awpbash/SilverGait.git
cd SilverGait
cp .env.example .env   # add your GEMINI_API_KEY
./run.sh               # or run.bat on Windows
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

Use `share.sh` / `share.bat` for a public URL via ngrok.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Video analysis, chat agent, fallback STT/TTS |
| `mera_API_KEY` | No | MERaLiON Singlish-aware STT (cr8lab API) |
| `ELEVENLABS_API_KEY` | No | High-quality TTS + voice cloning |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Zustand, CSS variables |
| Backend | FastAPI, Python 3.10+, SQLAlchemy async, SQLite |
| AI | Gemini 2.5 Flash (chat + video), Gemini Flash Lite (sub-agents) |
| STT | MERaLiON AudioLLM (Singlish) -> Gemini fallback |
| TTS | ElevenLabs -> Gemini fallback |
| Orchestration | LangGraph (Assessment Graph + Chat Graph) |
