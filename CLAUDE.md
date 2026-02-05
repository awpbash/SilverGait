# Project: SilverGait (Singapore Elderly Mobility Care)

## Hackathon Winning Vision
SilverGait is a camera-first, elderly-friendly physiotherapy companion designed for Singapore's ageing population. It delivers a 5-minute daily mobility check (SPPB-style), instant feedback, and a personalized exercise plan, all on a phone. The goal is to reduce falls, keep seniors independent longer, and make early intervention accessible beyond clinics.

### Why This Wins
- **Clear problem with local urgency**: Falls and mobility decline are a top driver of hospitalizations in Singapore's ageing society. Early detection is hard outside clinics.
- **Low-friction daily ritual**: A single "Check My Strength Today" flow that works in 5 minutes without wearables.
- **Cultural fit**: HDB-friendly setup, Singlish tone option, and easy caregiver sharing.
- **Fast validation path**: Ready for pilots with Active Ageing Centres and polyclinics.

## Project Status: MVP Ready for Demo
- Video recording and Gemini analysis working
- Mobile-friendly UI with bottom navigation
- Shareable via ngrok

## Quick Start
```bash
# 1. Set Gemini API key in .env
GEMINI_API_KEY=your_key_here

# 2. Run the app
./run.sh

# 3. Share publicly (optional)
./share.sh  # Uses ngrok
```

## Project Structure
```
silvergait/
├── .env                 # Only needs GEMINI_API_KEY
├── run.sh               # Starts backend + frontend
├── share.sh             # Creates public ngrok link
├── backend/             # Python FastAPI
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── core/config.py
│       ├── models/      # HealthMetrics, AssessmentResult, InterventionAction
│       ├── services/
│       │   ├── gemini_vision.py  # Video analysis with google.genai
│       │   ├── hpb_wearables.py  # Demo mode (no API key needed)
│       │   ├── sealion.py        # Passthrough (no API key needed)
│       │   └── agent.py          # Decision logic
│       └── routers/     # /api/assessment/analyze, /api/health/*, /api/intervention/*
└── frontend/            # React + Vite + TypeScript + Tailwind
    └── src/
        ├── types/       # TypeScript interfaces
        ├── stores/      # Zustand (userStore, assessmentStore)
        ├── services/    # API client
        ├── components/  # Loading, ErrorMessage, BottomNav
        └── pages/       # HomePage, AssessmentPage, ActivityPage, ExercisesPage
```

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Backend**: FastAPI, Python 3.10+
- **AI**: Gemini 2.0 Flash (via `google-genai` SDK)
- **Sharing**: ngrok for public URLs

## Key Features Implemented

### 1. Mobility Assessment (SPPB)
- Video recording with mobile camera support
- Video preview before analysis
- Gemini analyzes gait/balance and returns:
  - Score (0-4)
  - Issues detected (shuffling, sway, slow_speed, etc.)
  - Personalized recommendations

### 2. Activity Tracking
- Demo data for steps/MVPA (HPB integration ready but optional)
- Weekly trend visualization
- Day-by-day breakdown

### 3. Exercise Guide
- 5 elderly-friendly exercises with step-by-step instructions
- Safety reminders
- Difficulty levels

### 4. UI/UX (Elderly-Friendly)
- 18px+ font sizes
- 48px+ touch targets
- High contrast colors
- Bottom tab navigation (no hamburger menus)
- Singapore context (HDB, Singlish tips)

### 5. Voice Access (Optional)
- Voice navigation via STT + intent routing
- TTS guidance for setup and countdown
- Language options: English, Mandarin, Bahasa Melayu, Singlish
- Singlish / language rewrite using SeaLion (or Gemini fallback)

## Expanded Product Concept (Hackathon Pitch)

### Core User Journey (5 minutes)
1. **Home**: "Good morning, Mr Tan" + one big button.
2. **Camera setup**: Place phone on a table, step inside the box.
3. **Assessment**: Stand up & sit down, then walk forward. 3-2-1 countdown.
4. **Results**: Clear feedback ("Your movement looks steady today") + one action.
5. **Exercise**: One guided exercise for today, simple instructions.

### Differentiators vs. Typical Health Apps
- **Camera-based SPPB scoring** without external sensors
- **Trust-first UX** for seniors (large type, minimal decisions, clear safety)
- **Local context**: HDB layouts, Singlish prompts, HPB aligned messaging
- **Caregiver mode**: Optional detail view with confidence scores and issues

### Impact Metrics (How We Win the Pitch)
- **Short term**: 5-minute check adoption, weekly adherence, and exercise completion
- **Mid term**: Improved SPPB scores and reduced fall-risk flags
- **Long term**: Fewer hospital visits, delayed frailty progression

### Pilot Plan (Singapore)
- **Partners**: Active Ageing Centres, polyclinics, HPB, community hospitals
- **Pilot design**: 3-month trial with baseline SPPB, 8-week coaching
- **Outcome measures**: adherence, score improvements, user satisfaction, caregiver engagement

### Privacy + Trust
- **Video is processed securely**; no public sharing
- **Consent-first** prompts with caregiver options
- **Data minimization**: store scores + key metrics, not raw video unless opted in

### Business / Deployment
- **B2G2C** model with HPB/community partners
- **Bundled care** for senior centers: assessment + guided exercise packs
- **Clinician dashboard (future)** for referrals and monitoring

### Demo Script (3 minutes)
1. Show Home screen with daily greeting.
2. Start assessment and show setup overlay.
3. Countdown and "Stand Up & Sit Down" step.
4. Results: "Your movement looks steady today."
5. Show today's exercise with simple steps.

## Gemini Integration
Using new `google-genai` SDK:
```python
from google import genai
client = genai.Client(api_key=GEMINI_API_KEY)
uploaded_file = client.files.upload(file="video.webm")
response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=[uploaded_file, PROMPT]
)
```

## Environment Variables
Only one required:
```
GEMINI_API_KEY=your_key_here
```

Optional (app works without these):
- HPB_API_KEY - For real wearable data
- SEALION_API_KEY - For Singlish translation

## URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

## ngrok Setup (for sharing)
1. Install: `npm install -g localtunnel` or use ngrok
2. Add allowed host to `frontend/vite.config.ts`:
   ```ts
   server: {
     allowedHosts: ['your-subdomain.ngrok-free.app'],
   }
   ```
3. Run: `ngrok http 5173`
