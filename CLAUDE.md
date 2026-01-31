# Project: SilverPhysio (Singapore Elderly Mobility Care)

## Project Status: MVP Complete
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
