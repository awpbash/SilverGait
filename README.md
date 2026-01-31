# SilverGait

> AI-powered mobility assessment and exercise platform for Singapore's elderly community

SilverGait helps seniors maintain their mobility and independence through video-based gait analysis, activity tracking, and personalized exercise recommendations. Designed with Singapore's elderly in mind.

## Features

### Mobility Assessment (SPPB-Based)
- Record walking videos using your mobile device
- AI-powered gait and balance analysis using Gemini 2.0 Flash
- Get scored assessments (0-4 scale) with detailed feedback
- Identifies issues like shuffling, sway, and slow speed
- Personalized recommendations based on your results

### Activity Tracking
- Monitor daily steps and moderate-to-vigorous physical activity (MVPA)
- Weekly trend visualization
- Day-by-day activity breakdown
- Integration-ready with HPB wearables

### Exercise Guide
- 5 elderly-friendly exercises with step-by-step instructions
- Safety reminders and precautions
- Difficulty levels for different fitness levels
- Singapore-specific context (HDB-friendly exercises)

### Elderly-Friendly Design
- Large fonts (18px+) for easy reading
- Large touch targets (48px+) for easy tapping
- High contrast colors for better visibility
- Simple bottom navigation (no confusing menus)
- Singapore context with Singlish tips

## Quick Start

### Prerequisites
- Python 3.10 or higher
- Node.js 16 or higher
- A Gemini API key (get one from [Google AI Studio](https://aistudio.google.com/app/apikey))

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd silvergait
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your Gemini API key:
# GEMINI_API_KEY=your_key_here
```

3. Run the application:
```bash
chmod +x run.sh
./run.sh
```

The app will start:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/api/docs

### Sharing Your Instance

To share your local instance publicly (e.g., for testing on mobile devices):

```bash
chmod +x share.sh
./share.sh
```

This will create a public URL using ngrok that you can access from any device.

## Tech Stack

### Frontend
- **React 18** - Modern UI library
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management

### Backend
- **FastAPI** - High-performance Python web framework
- **Python 3.10+** - Modern Python features
- **Pydantic** - Data validation and settings management

### AI/ML
- **Gemini 2.0 Flash** - Google's multimodal AI for video analysis
- **google-genai SDK** - Official Python SDK for Gemini

## Project Structure

```
silvergait/
├── .env                 # Environment variables (Gemini API key)
├── run.sh               # Start backend + frontend
├── share.sh             # Create public ngrok URL
├── backend/             # FastAPI backend
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── core/
│       │   └── config.py        # Configuration management
│       ├── models/              # Data models
│       │   ├── health_metrics.py
│       │   ├── assessment.py
│       │   └── intervention.py
│       ├── services/
│       │   ├── gemini_vision.py # Video analysis
│       │   ├── hpb_wearables.py # Activity tracking
│       │   ├── sealion.py       # Singlish translation
│       │   └── agent.py         # Decision logic
│       └── routers/             # API endpoints
│           ├── assessment.py
│           ├── health.py
│           └── intervention.py
└── frontend/            # React frontend
    ├── package.json
    └── src/
        ├── types/       # TypeScript interfaces
        ├── stores/      # Zustand state management
        ├── services/    # API client
        ├── components/  # Reusable components
        └── pages/       # Main application pages
            ├── HomePage.tsx
            ├── AssessmentPage.tsx
            ├── ActivityPage.tsx
            └── ExercisesPage.tsx
```

## API Endpoints

### Assessment
- `POST /api/assessment/analyze` - Upload and analyze walking video
- `GET /api/assessment/history` - Get past assessments

### Health Metrics
- `GET /api/health/steps` - Get step count data
- `GET /api/health/mvpa` - Get MVPA data
- `GET /api/health/summary` - Get weekly summary

### Interventions
- `GET /api/intervention/exercises` - Get recommended exercises
- `GET /api/intervention/actions` - Get personalized action plan

## Environment Variables

Create a `.env` file in the root directory:

```env
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Optional (app works in demo mode without these)
HPB_API_KEY=your_hpb_api_key         # For real wearable data
SEALION_API_KEY=your_sealion_key     # For Singlish translation
```

## Development

### Backend Development

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## Deployment

### Local Network (for testing)

Use the included `share.sh` script to create a public URL via ngrok:

```bash
./share.sh
```

### Production Deployment

1. Set up a production server (e.g., AWS, DigitalOcean, Heroku)
2. Configure environment variables
3. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```
4. Serve the backend with a production ASGI server like gunicorn
5. Use nginx or similar to serve the frontend static files

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

[Your License Here]

## Acknowledgments

- Built for Singapore's elderly community
- Inspired by the Short Physical Performance Battery (SPPB)
- Powered by Google's Gemini AI
- Designed for accessibility and ease of use

## Support

For issues and questions:
- Create an issue in the repository
- Contact: [Your Contact Information]

---

Made with care for Singapore's seniors.
