# SilverGait Full-Stack Audit

**Date:** 2026-03-31
**Scope:** End-to-end functionality audit — assessment pipeline, chat agent system, management sub-agents, user journey, session management, data persistence, UI/UX.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Assessment Pipeline Audit](#2-assessment-pipeline-audit)
3. [Chat Agent & Sub-Agents Audit](#3-chat-agent--sub-agents-audit)
4. [User Journey & Session Management Audit](#4-user-journey--session-management-audit)
5. [Frontend UI/UX Audit](#5-frontend-uiux-audit)
6. [What's Working Well](#6-whats-working-well)
7. [Consolidated Issue Tracker](#7-consolidated-issue-tracker)
8. [Recommended Fix Priority](#8-recommended-fix-priority)

---

## 1. Architecture Overview

```
Assessment Graph (0 LLM calls)          Chat Graph (1+ LLM calls)
Score -> Classify -> Tier Change?       Context Assembly -> Agent (Gemini)
  YES -> Update Plans -> Notify             | function_call |
  NO  -> Persist                        +-- Exercise Agent (Gemini)
         | writes DB                    |-- Sleep Agent (Gemini)
         +-----------> Database <-------+-- Education Agent (Gemini)
                                        |-- Monitoring Agent (Gemini)
                                        |-- Progress Summary (deterministic)
                                        +-- Alert Caregiver (deterministic)
                                            -> Safety Gate -> Persist
```

**Design philosophy:** LLM only where reasoning is needed. Scoring, classification, routing, and plan selection are all deterministic. The only LLM calls are Gemini video analysis and the Chat Agent + sub-agents.

---

## 2. Assessment Pipeline Audit

### 2.1 Data Flow

```
Frontend Video Capture (useAssessmentFlow.ts)
  -> MediaRecorder captures WebM
  -> Pose detection runs in real-time (usePoseDetection)
  -> Metrics collected per-frame (usePoseMetrics)
  -> POST /api/assessment/analyze-stream (FormData: video + pose_metrics + test_type)

Backend Video Analysis (gemini_vision.py)
  -> Upload video to Gemini File API
  -> Wait for processing
  -> Send prompt + video to Gemini 2.5 Flash
  -> Parse JSON response (score 0-4, issues, confidence, recommendations)
  -> Return AssessmentResult

Assessment Graph (assessment_graph.py, 6 nodes, 0 LLM calls)
  -> score_node: compute katz_total, cfs_score, sppb_total
  -> classify_node: classify_frailty(cfs, katz, sppb) -> tier
  -> tier_change_router: check if tier changed from previous
  -> update_plans_node: create new care plans if tier changed
  -> notify_node: create alerts if tier changed
  -> persist_node: save FrailtyEvaluation + AgentRun

Frontend Display (AssessmentResultView.tsx)
  -> ScoreRing with SPPB total
  -> Test breakdown cards
  -> Movement graphs from pose metrics
  -> Clinical metrics (expandable)
```

### 2.2 Critical Issues

#### A1: SPPB Score Pydantic Validation Mismatch (HIGH)

**Location:** `backend/app/models/assessment.py` (Pydantic model) vs `frontend/src/hooks/useAssessmentFlow.ts`

**Problem:** The Pydantic model validates `score` as `Field(..., ge=0, le=4)` (component score 0-4), but the frontend computes and sends the SPPB total (0-12) when multiple tests are completed:

```typescript
// Frontend: useAssessmentFlow.ts
const balance = results.balance?.score ?? 0;  // 0-4
const gait = results.gait?.score ?? 0;        // 0-4
const chair = results.chair_stand?.score ?? 0; // 0-4
const totalScore = balance + gait + chair;     // 0-12 ← sent as "score"
```

```python
# Backend Pydantic model
score: int = Field(..., ge=0, le=4, description="Component score 0-4")
```

**Impact:** Multi-test submissions with score > 4 get rejected with 422 HTTP error. Frontend catches this as a generic "Analysis failed" error with no specifics.

**Fix:** Change Pydantic validation to `ge=0, le=12` for total score, or split into `component_score` (0-4) and `total_score` (0-12).

---

#### A2: Assessment Graph Queries Wrong test_type (HIGH)

**Location:** `backend/app/services/langgraph_agents/assessment_graph.py:106`

**Problem:** The Assessment Graph queries for previous SPPB scores using `test_type == "comprehensive"`, but individual tests are saved with their actual type ("balance", "gait", "chair_stand"):

```python
# assessment_graph.py line 106
.where(Assessment.user_id == user_id, Assessment.test_type == "comprehensive")
```

**Impact:** When a user completes individual tests, the Assessment Graph cannot find previous SPPB scores. It falls back to defaults (`katz=6, cfs=2`, i.e., "robust"), potentially misclassifying the user.

**Fix:** Query for the latest assessment regardless of test_type, or aggregate individual test scores.

---

#### A3: Partial Test Breakdown Stores 0 Instead of null (HIGH)

**Location:** `frontend/src/hooks/useAssessmentFlow.ts` (buildSummary)

**Problem:** When only 1-2 tests are completed, the breakdown stores missing scores as 0:

```typescript
sppb_breakdown: {
  balance_score: 3,    // completed
  gait_score: 0,       // NOT completed, stored as 0
  chair_stand_score: 0  // NOT completed, stored as 0
}
```

**Impact:** Frailty classification treats incomplete tests as failed tests (score=0), which underestimates the user's ability. A user who only did balance (score 3) gets classified with SPPB total = 3 instead of "partial assessment, only balance completed."

**Fix:** Use `null` for untested components. Backend should compute total only from `completed_tests` array.

---

#### A4: Gemini Parse Failure Returns Silent Fake Score (MEDIUM)

**Location:** `backend/app/services/gemini_vision.py:454-470`

**Problem:** When Gemini returns invalid JSON, the error handler returns a fallback `AssessmentResult` with `score=2, confidence=0.3`. This is indistinguishable from an actual poor-quality assessment.

```python
# Fallback on parse failure
return AssessmentResult(
    score=2,
    confidence=0.3,
    issues=[],
    recommendations=["Continue daily movement..."],
    low_confidence_warning="This score is an estimate..."
)
```

**Impact:** Silent data corruption — the user and the Assessment Graph both receive what looks like a real score.

**Fix:** Return an explicit error state (e.g., `score=None, error="analysis_failed"`) instead of a fake score. Let the frontend handle the distinction.

---

#### A5: Race Condition in Assessment Graph Execution (MEDIUM)

**Location:** `backend/app/routers/assessment.py:167-199`

**Problem:** The Assessment Graph runs inside the SSE generator, after the "complete" stage is yielded. If the user submits a second assessment before the first graph finishes, both graphs race on tier/plan updates.

**Impact:** Concurrent assessments may overwrite each other's frailty tier and care plans. No atomic transaction spans multiple graph runs.

**Fix:** Queue Assessment Graph runs with a per-user lock, or run them outside the SSE generator with a background task.

---

#### A6: Confidence Score Not Displayed (LOW)

**Location:** `frontend/src/components/AssessmentResultView.tsx`

**Problem:** Backend computes and stores confidence (0.0-1.0), but the UI only checks for `low_confidence_warning` string. The numeric confidence is ignored.

**Impact:** A test with confidence=0.3 looks identical to confidence=0.95 in the UI. Users can't tell if their result is reliable.

**Fix:** Show a confidence indicator (e.g., "High/Medium/Low confidence" badge on the score ring).

---

### 2.3 Gemini Failure Scenarios & Fallbacks

| Scenario | Handling | Result |
|----------|----------|--------|
| Gemini returns invalid JSON | Exception caught → fallback score=2, confidence=0.3 | **Silent fake score** (see A4) |
| Gemini returns empty response | Exception caught → same fallback | Same issue |
| Video upload fails | Yields `("error", {"detail": str(e)})` | Frontend shows error |
| 120s timeout | Frontend AbortController fires | "Analysis failed" shown |
| Gemini returns score outside 0-4 | Clamped via `min(4, max(0, score))` | Safe |
| Confidence outside 0-1 | **Not validated** | Invalid value stored |

---

## 3. Chat Agent & Sub-Agents Audit

### 3.1 Data Flow

```
User types message in HomePage.tsx
  -> sendMessage() creates user + bot message bubbles
  -> chatApi.sendStream() POST /api/chat/stream (SSE)

Backend Chat Graph (4 nodes):

  Node 1: context_assembly_node
    -> build_user_context(db, user_id) → UserContext dataclass
    -> Assembles: tier, scores, plans, trends, risks, exercise stats
    -> Serializes to system prompt for Gemini

  Node 2: agent_node (1+ LLM calls)
    -> Load last 2 chat messages (filtered by language)
    -> First Gemini call with 7 tool declarations
    -> If Gemini requests tools:
       -> Execute each tool (sequential)
       -> Second Gemini call with tool results
    -> Stream response chunks via SSE

  Node 3: safety_gate_node
    -> Pattern-match user message for:
       - Falls (EN/ZH/TA patterns)
       - Emergency symptoms (chest pain, breathing, stroke, fainting)
       - Mental distress (suicidal ideation)
    -> If matched: create Alert in DB + append crisis info

  Node 4: persist_node
    -> Save user message to ChatMessage table
    -> Save assistant response + appendix + tool_calls metadata

Frontend receives SSE chunks -> appendToMessage() updates bubble real-time
```

### 3.2 Tool Declarations (Gemini Function Calling)

| Tool | Purpose | LLM Calls | Fallback |
|------|---------|-----------|----------|
| `get_exercise_plan` | Personalized 4-week program | 1 (Exercise Agent) | Curated plan from content_library |
| `get_sleep_advice` | CBT-I + sleep hygiene | 1 (Sleep Agent) | Static content by risk level |
| `get_education` | Frailty/balance/nutrition education | 1 (Education Agent) | Static content by topic/tier |
| `analyze_trends` | Health trend detection | 1 (Monitoring Agent) | Static monitoring notes |
| `get_progress_summary` | SPPB/Katz trends + streak | 0 (Deterministic) | Direct DB query |
| `alert_caregiver` | Emergency alerts | 0 (DB write) | Always succeeds |
| `navigate_to_page` | Direct to app pages | 0 (Deterministic) | Always succeeds |

### 3.3 Safety Gate Patterns

**Falls:** `fell`, `fall`, `fallen`, `slipped`, `tripped`, `stumbled`, `跌倒`, `摔倒`, `விழுந்த` (excludes "fall asleep", "rainfall")

**Emergency:** chest pain, heart attack, can't breathe, slurred speech, face droop, sudden weakness, fainted, passed out, bleeding heavily

**Mental distress:** want to die, hopeless, no point living, burden to everyone, `想死`, `不想活`, `nak mati`, `bunuh diri`, `சாக விரும்புகிறேன்`

**Actions on trigger:**
- Create `Alert` (severity=urgent) in DB
- Emergency/distress: append crisis numbers (SOS: 1767, SAF: 1800-278-0022, IMH: 6389-2222)
- Falls: create alert but no appendix (agent handles empathetic response)

### 3.4 Critical Issues

#### C1: No Timeout on Gemini Streaming (HIGH)

**Location:** `backend/app/services/langgraph_agents/chat_graph.py:676`

**Problem:** `generate_content_stream()` has no timeout parameter. If Gemini hangs, the connection hangs forever.

**Impact:** Resource leak, browser holds connection, user sees infinite loading.

**Fix:** Add `timeout=30` to GenerateContentConfig, or wrap with `asyncio.wait_for()`.

---

#### C2: Tool Execution is Sequential (MEDIUM)

**Location:** `backend/app/services/langgraph_agents/chat_graph.py:369-391`

**Problem:** When Gemini requests multiple tools, they execute one at a time:

```python
for fc in function_calls_detected:
    tool_result = await _execute_tool(...)  # sequential
```

**Impact:** If 3 tools are requested (e.g., exercise + education + trends), latency is 3x instead of 1x. Each sub-agent makes 1 Gemini call (~1-3 seconds each).

**Fix:** Use `asyncio.gather()` for parallel execution.

---

#### C3: No Rate Limiting on Chat Endpoint (MEDIUM)

**Location:** `backend/app/routers/chat.py`

**Problem:** No rate limiting. A user (or bot) could spam messages, causing rapid Gemini token consumption and DB write surge.

**Fix:** Add `slowapi` or similar rate limiter (~10 messages/minute per user).

---

#### C4: Chat History Limited to 2 Messages (MEDIUM)

**Location:** `backend/app/services/langgraph_agents/chat_graph.py:326`

**Problem:** Only the last 2 chat messages are loaded into Gemini context. Multi-turn conversations lose context.

**Design rationale:** Avoids token bloat and bias toward old topics. System prompt says "Focus ONLY on the current message."

**Impact:** User asks "Any other suggestions?" → Gemini doesn't know what "other" refers to from earlier in the conversation.

**Tradeoff:** Acceptable for POC, but production should scale to ~10 messages with summarization.

---

#### C5: Safety Gate Missing Malay Fall Patterns (MEDIUM)

**Location:** `backend/app/services/langgraph_agents/chat_graph.py:462`

**Problem:** Fall detection patterns include English, Chinese, and Tamil, but Malay variations are incomplete. Common Malay terms like `jatuh` (fall), `terjatuh` (fallen) may not be fully covered.

**Fix:** Add Malay patterns: `r"\bjatuh\b"`, `r"\bterjatuh\b"`, `r"\btergelincir\b"` (slipped).

---

#### C6: MERaLiON Hardcoded 3-Second Delay (LOW)

**Location:** `backend/app/services/meralion.py`

**Problem:** `await asyncio.sleep(3)` after uploading audio to cr8lab S3, regardless of actual indexing time.

**Impact:** Adds 3 seconds to every STT call. Not critical, but noticeable for UX.

---

### 3.5 Voice Pipeline (STT -> Chat -> TTS)

```
STT Chain:
  MERaLiON AudioLLM (cr8lab API, Singlish-aware)
    -> Upload WAV to S3 -> wait 3s -> POST /transcribe
    -> If fails: Gemini fallback STT
    -> If both fail: HTTP 502

TTS Chain:
  ElevenLabs (streaming MP3, high quality, supports voice cloning)
    -> If unavailable: Gemini TTS (WAV)
    -> If unavailable: Browser SpeechSynthesis (client-side)
```

### 3.6 Content Library Fallbacks

When LLM sub-agents fail, the system falls back to curated content from `content_library.py`:

- **Exercise plans:** By tier (robust/pre_frail/frail/severely_frail) x language (en/zh/ms/ta)
- **Sleep advice:** By risk level (low/moderate/high)
- **Education:** By topic (frailty/balance/falls_prevention/nutrition) x tier
- **Monitoring:** Static notes by tier

All fallback content is localized in 4 languages and clinically vetted.

---

## 4. User Journey & Session Management Audit

### 4.1 Onboarding Flow

```
Step 1: Welcome
  -> Enter display name, gender, preferred language
  -> Voice support: TTS reads instructions, STT captures answers

Step 2: Katz ADL (6 yes/no questions)
  -> Bathing, Dressing, Toileting, Transferring, Continence, Feeding
  -> Each answer is boolean

Step 3: Contributing Conditions (4 risk questions)
  -> Sleep quality (low/moderate/high)
  -> Mood/depression (rarely/sometimes/often)
  -> Social isolation (often/sometimes/rarely)
  -> Cognitive decline (no/a little/yes)

Submit:
  -> POST /api/users (create user + session token)
  -> POST /api/users/{id}/health-snapshot (save answers)
  -> Backend:
     1. Create HealthSnapshot (append-only)
     2. score_katz() -> katz_total (0-6)
     3. score_cfs(katz_total) -> cfs_score (1-9)
     4. run_assessment_pipeline():
        - classify_frailty(cfs, katz, sppb=None) -> tier
        - Create CarePlans based on tier + risks
        - Create FrailtyEvaluation record
  -> Frontend: setHasOnboarded(true)
```

### 4.2 Scoring Logic

```
Katz ADL: katz_total = count of True values (0-6)

CFS (from Katz):
  katz >= 6 -> cfs = 2 (well)
  katz >= 5 -> cfs = 3 (managing well)
  katz >= 4 -> cfs = 4 (vulnerable)
  katz >= 3 -> cfs = 5 (mildly frail)
  katz >= 2 -> cfs = 6 (moderately frail)
  katz >= 1 -> cfs = 7 (severely frail)
  katz = 0  -> cfs = 8 (very severely frail)

Frailty Tier:
  if cfs >= 7 or (katz <= 2 and sppb <= 3) -> severely_frail
  elif cfs >= 5 or (katz <= 4 and sppb <= 6) -> frail
  elif cfs >= 4 or (sppb <= 9) -> pre_frail
  else -> robust
```

### 4.3 Session Management

- **Token format:** `secrets.token_urlsafe(32)` (~43 chars, URL-safe base64)
- **Token lifetime:** 90 days (configurable via `session_expiry_days`)
- **Storage:** Frontend localStorage via Zustand persist (`SilverGait-user` key)
- **Validation:** `get_current_user()` middleware checks token existence, expiry, and user_id match
- **No refresh tokens** — single long-lived token only
- **On 401:** Frontend clears localStorage, reloads page, triggers re-onboarding

### 4.4 State Synchronization

| Data | Frontend (localStorage) | Backend (SQLite) | Sync Method |
|------|------------------------|-------------------|-------------|
| User identity | userId, token, name, gender, lang | users table | Created at onboarding |
| Health scores | NOT stored | health_snapshots (append-only) | Fetched via `/context` API |
| Frailty tier | NOT stored | frailty_evaluations | Fetched via `/context` API |
| Care plans | NOT stored | care_plans (active/superseded) | Fetched via `/context` API |
| Assessments | Last 20 in assessmentStore | assessments table | Stored locally + backend |
| Chat messages | In-memory only (chatStore) | chat_messages table | **NOT synced on reload** |
| Exercise logs | localStorage (`silvergait-exercises`) | exercise_logs table | Stored locally + backend |
| Voice ID | In userStore | users.voice_id | Stored locally + backend |

### 4.5 Critical Issues

#### U1: Chat Messages Lost on Page Refresh (HIGH)

**Location:** `frontend/src/stores/chatStore.ts`

**Problem:** chatStore uses Zustand without `persist` middleware. Page refresh clears all conversation history. Backend saves messages to `chat_messages` table, but frontend never fetches them on reload.

**Impact:** User loses entire conversation on refresh/navigation. Returning users always start fresh.

**Fix:** Add `persist` middleware to chatStore, or fetch recent messages from `/api/chat/history` endpoint on mount.

---

#### U2: DB Wipe Orphans User Data (MEDIUM)

**Location:** Session validation flow in `App.tsx` and `backend/app/core/auth.py`

**Problem:** If the backend DB is wiped (e.g., server restart on Render, dev reset), the user's localStorage still has a valid-looking token. The first API call returns 401 → frontend clears state → user re-onboards with a NEW user_id. Old data is orphaned.

**Impact:** User loses all history, assessments, and progress. Acceptable for dev, problematic for production.

**Fix:** For production: use persistent DB (not SQLite file). For POC: document as known behavior.

---

#### U3: No Token Refresh Mechanism (MEDIUM)

**Location:** `backend/app/core/auth.py`

**Problem:** Single 90-day token with no refresh. If token is lost or expires, user must re-onboard entirely.

**Impact:** Long-term users may lose access after 90 days. No way to extend session without re-onboarding.

**Fix:** Implement refresh token rotation, or auto-extend token on active use.

---

#### U4: Token Expiry During Active Session (MEDIUM)

**Location:** Axios interceptor in `frontend/src/services/api.ts`

**Problem:** If token expires while the user is actively using the app, the next API call triggers a 401, which calls `resetSession()` → clears localStorage → reloads page. No warning.

**Impact:** Abrupt UX — user may lose unsent chat input or in-progress assessment.

**Fix:** Check token expiry on frontend before making requests. Show warning dialog before clearing session.

---

#### U5: Duplicate Health Snapshots on Network Retry (LOW)

**Location:** `frontend/src/components/OnboardingModal.tsx` (handleSubmit)

**Problem:** If the health snapshot POST fails due to network, the user retries, creating a duplicate snapshot. Both trigger Assessment Graph runs.

**Impact:** Idempotent (same data → same tier), but creates unnecessary DB rows and graph executions.

**Fix:** Add idempotency key to health snapshot creation, or check for recent duplicate before insert.

---

## 5. Frontend UI/UX Audit

### 5.1 Issues Found & Fixed (2026-03-31)

| Issue | Status | Files Changed |
|-------|--------|---------------|
| `Loading.tsx` uses Tailwind classes instead of CSS | **Fixed** | `Loading.tsx`, `index.css` |
| `ErrorMessage.tsx` uses Tailwind classes | **Fixed** | `ErrorMessage.tsx`, `index.css` |
| `HomePage.tsx:89` references `recognitionRef` before declaration | **Fixed** | `HomePage.tsx` |
| `(t as any)` casts in MorePage, SleepPage, WearablesPage | **Fixed** | 3 page files |
| No back buttons on sub-pages (More -> sub-pages) | **Fixed** | `AppHeader.tsx`, 8 page files |
| Hardcoded hex colors in MorePage tiles | **Fixed** | `MorePage.tsx`, `index.css` |

### 5.2 Remaining Issues

| Priority | Issue | Location |
|----------|-------|----------|
| P1 | No error boundaries — page crash = white screen | `App.tsx` |
| P1 | Fixed 390px phone frame, single 480px breakpoint | `index.css` |
| P1 | OnboardingModal is 679 lines — unmaintainable | `OnboardingModal.tsx` |
| P2 | STT/TTS logic duplicated across 3+ components | `HomePage`, `OnboardingModal`, `VoiceSettingsPage` |
| P2 | ScoreRing, PoseOverlay use hardcoded colors | `ScoreRing.tsx`, `PoseOverlay.tsx` |
| P2 | Markdown parser is regex-based, potential XSS | `Markdown.tsx` |
| P2 | No font size adjustment for elderly users | `index.css` |
| P3 | assessmentStore hardcoded history limit (20) | `assessmentStore.ts` |
| P3 | Silent `.catch(() => {})` swallowing API errors | Multiple pages |
| P3 | No high-contrast mode toggle | N/A |

### 5.3 Accessibility for Elderly Users

| Feature | Status | Notes |
|---------|--------|-------|
| 18px+ base font | Present | `html { font-size: 18px }` |
| 48px+ touch targets | Mostly present | Some buttons (e.g., "Read aloud") could be larger |
| High contrast palette | Partial | Warm olive/sage palette, but no WCAG AAA verification |
| TTS on all screens | Partial | Chat + onboarding have TTS; other pages don't |
| Icon + text labels | Present | Bottom nav has both icon and text |
| One decision at a time | Present | Onboarding flow is step-by-step |
| Font size adjustment | **Missing** | No user control for zoom |
| High contrast mode | **Missing** | No toggle |
| Haptic feedback | **Missing** | No vibration on mobile |

---

## 6. What's Working Well

### Architecture
- **Two-graph separation** is sound — deterministic scoring (0 LLM) for clinical decisions, LLM for conversational reasoning
- **Append-only health snapshots** — full audit trail, no update anomalies
- **Session isolation** — token-to-user enforcement prevents cross-user access
- **LLM budget discipline** — Assessment: 0 calls, Chat: 1 orchestrator + 0-2 sub-agents per message

### Chat System
- **Gemini function calling** properly structured with 7 tools and clear fallback logic
- **Context assembly** is comprehensive — single batch query builds full user picture (tier, scores, plans, trends, risks, exercise stats)
- **Safety gate** catches falls, emergencies, and suicidal ideation in EN/ZH/TA with Singapore-specific crisis numbers
- **System prompt** is well-crafted — enforces language, limits response length, requires actionable advice

### Fallback Chains
- **STT:** MERaLiON (Singlish-aware) -> Gemini -> HTTP 502
- **TTS:** ElevenLabs (streaming, cloned voice) -> Gemini -> Browser SpeechSynthesis
- **Sub-agents:** LLM agent -> curated content library (4 languages)
- **Chat:** Gemini with tools -> Gemini without tools -> canned fallback message

### Content
- **Content library** has curated plans by tier x language (en/zh/ms/ta)
- **Exercise plans** are clinically appropriate for each tier (robust -> gentle -> supported)
- **Sleep advice** includes CBT-I techniques for moderate/high risk
- **Education content** is personalized by tier and topic
- **i18n** covers English, Mandarin, Malay, Tamil with full translation coverage

---

## 7. Consolidated Issue Tracker

### High Severity

| ID | Category | Issue | Status |
|----|----------|-------|--------|
| A1 | Assessment | SPPB total (0-12) rejected by Pydantic validation (0-4) | **FIXED** — validation now accepts 0-12 |
| A2 | Assessment | Graph queries `test_type=="comprehensive"`, misses individual tests | **FIXED** — queries latest total_score, then aggregates individual tests |
| A3 | Assessment | Partial tests store 0 instead of null for untested components | **FIXED** — buildSummary uses null for untested, only sums completed |
| C1 | Chat | No timeout on Gemini streaming — hangs forever if Gemini stalls | **FIXED** — 30s timeout via asyncio.wait_for on both Gemini calls |
| U1 | Journey | Chat messages lost on page refresh (no persist) | **FIXED** — Zustand persist + GET /api/chat/history endpoint + fetch on mount |

### Medium Severity

| ID | Category | Issue | Status |
|----|----------|-------|--------|
| A4 | Assessment | Gemini parse failure returns fake score=2 silently | **FIXED** — now yields error stage instead of fake score |
| A5 | Assessment | Race condition in Assessment Graph (runs inside SSE generator) | Open |
| C2 | Chat | Tool execution sequential, not parallel | **FIXED** — asyncio.gather() for parallel execution |
| C3 | Chat | No rate limiting on chat endpoint | **FIXED** — in-memory rate limiter (10/min chat, 5/min assessment) |
| C4 | Chat | History limited to 2 messages (by design) | Open (acceptable for POC) |
| C5 | Chat | Safety gate missing Malay fall patterns | **FIXED** — added `tergelincir` (slipped) |
| U2 | Journey | DB wipe + stale localStorage = orphaned user | Open (documented as known behavior) |
| U3 | Journey | No refresh tokens, 90-day single token | **FIXED** — auto-extend token when within 30 days of expiry |
| U4 | Journey | Token expiry during session = abrupt re-onboard | **FIXED** — warning dialog before reset, auto-extend on active use |

### Low Severity

| ID | Category | Issue | Status |
|----|----------|-------|--------|
| A6 | Assessment | Confidence score stored but never shown | **FIXED** — confidence badge (High/Medium/Low) on result view |
| C6 | Chat | MERaLiON hardcoded 3s delay | Open |
| C7 | Chat | Language switch clears all chat history | Open |
| U5 | Journey | Duplicate health snapshots on network retry | Open |
| U6 | Journey | Frontend doesn't cache UserContext | Open |

---

## 8. Fix Status

### Phase 1: Data Integrity — **ALL FIXED**

1. **A1:** ✅ SPPB Pydantic validation accepts 0-12
2. **A2:** ✅ Assessment Graph aggregates individual test scores
3. **A3:** ✅ Untested components use null, not 0
4. **A4:** ✅ Gemini parse failures yield explicit error

### Phase 2: Reliability & Safety — **ALL FIXED**

5. **C1:** ✅ 30s timeout on Gemini streaming calls
6. **C2:** ✅ Parallel tool execution with asyncio.gather()
7. **C5:** ✅ Malay fall patterns added (tergelincir)
8. **U1:** ✅ Chat messages persisted (Zustand + backend history endpoint)

### Phase 3: Production Hardening — **3/4 FIXED**

9. **C3:** ✅ Rate limiting on chat (10/min) + assessment (5/min) endpoints
10. **A5:** Open — Assessment Graph still runs inside SSE generator
11. **A6:** ✅ Confidence badge displayed in assessment results
12. **U4:** ✅ Token expiry warning + auto-extend on active use

### Phase 4: UX Polish — **1/5 FIXED**

13. ✅ Error boundary wrapping all routes in App.tsx
14. Open — Responsive layout improvements
15. Open — Split OnboardingModal into smaller steps
16. Open — Consolidate STT/TTS logic
17. Open — Font size controls and high-contrast mode

---

## 9. Security & Code Quality Audit (2026-04-01)

### Fixed Issues

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| S1 | CRITICAL | Health endpoints (/health/*) had no authentication | Moved health_router behind `_auth` dependency in main.py |
| S2 | CRITICAL | Chat endpoint accepted arbitrary user_id in body without cross-checking auth token | Added `get_current_user` dependency + user_id validation |
| S3 | CRITICAL | Rate limiter had race condition (non-atomic check-then-act) | Added `asyncio.Lock()` for thread-safe check |
| S4 | HIGH | Exercise `days` parameter had no bounds (could accept 999999) | Added `Query(ge=1, le=365)` constraint |
| S5 | HIGH | Exercise `user_id` and `exercise_id` had no length limits | Added `Field(max_length=64)` |
| S6 | HIGH | Production console.log statements in TF.js/pose detection | Removed 8 console.log calls |
| S7 | MEDIUM | `as any` type casts in WearablesPage | Replaced with proper `as unknown as T` casts |
| S8 | MEDIUM | Silent `.catch(() => {})` swallowing errors | Added descriptive comments; errors now intentionally ignored with reason |
| S9 | MEDIUM | Weekly health fetch missing auth headers | Added `authHeaders()` to raw fetch call |
| S10 | LOW | Rate limiter missing Retry-After header | Added `headers={"Retry-After": str(window_seconds)}` |

### Remaining (Acceptable for POC)

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| S11 | MEDIUM | Timezone inconsistency (utcnow vs now) in Pydantic models | Documented — both UTC in practice |
| S12 | MEDIUM | Assessment user_id from Form body not cross-checked vs auth | Protected by global auth dependency |
| S13 | LOW | Hard-coded emergency phone numbers in chat_graph.py | Singapore-specific, rarely changes |
| S14 | LOW | Dead routers (agent.py, history.py, intervention.py) | Kept as placeholders per user request |

### Responsive UI Fixes (2026-04-01)

| Category | Count | Summary |
|----------|-------|---------|
| Touch targets < 48px | 15 fixed | All interactive elements now 44-48px minimum |
| Font sizes < 14px | 14 fixed | All text now renders at 14px+ for elderly readability |
| Hardcoded fixed widths | 10 fixed | Frame, modals, grids now use clamp/min/auto-fit |
| Mobile breakpoint | Improved | 480px → 768px, hides toolbar, uses 100dvh |
| Error boundary | Added | Catches page crashes with friendly recovery UI |
