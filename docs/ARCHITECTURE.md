# SilverGait — Detailed Architecture

> Detailed node-level specs, state schemas, and database design for SilverGait's two-graph LangGraph system. For the project overview, see [`../README.md`](../README.md).

---

## LangGraph Detail: Assessment Graph

**File:** `backend/app/services/langgraph_agents/assessment_graph.py`

### Nodes (all deterministic — no LLM)

#### 1. Score Node
- **After onboarding:** `score_katz(answers)` → 0-6, `score_cfs(katz_total)` → 1-9
- **After assessment:** `score_sppb(balance, gait, chair)` → 0-12
- **After profile update:** re-compute Katz + CFS from new answers

#### 2. Classify Node
- Uses `classify_frailty(cfs, katz, sppb)` — pure rule-based:
  ```
  if cfs >= 7 or (katz <= 2 and sppb is not None and sppb <= 3): tier = "severely_frail"
  elif cfs >= 5 or (katz <= 4 and sppb is not None and sppb <= 6): tier = "frail"
  elif cfs >= 4 or (sppb is not None and sppb <= 9): tier = "pre_frail"
  else: tier = "robust"
  ```
- Generates templated `risk_explanation`

#### 3. Tier Change Router (conditional edge)
- Compares new tier to previous from `frailty_evaluations`
- Returns `"changed"` or `"unchanged"`

#### 4. Update Plans Node (only if tier changed)
- Selects from content library: exercise, sleep, education, monitoring plans
- Supersedes old active plans (`status='superseded'`)

#### 5. Notify Node (only if tier changed)
- Creates alerts: `tier_decline` (urgent if frail/severely_frail) or `tier_improvement` (info)

#### 6. Persist Node (always runs)
- INSERT frailty_evaluations, care_plans, agent_runs

### State Schema

```python
class AssessmentState(TypedDict, total=False):
    user_id: str
    trigger: str              # onboarding | assessment | profile_update | biweekly_recheck
    language: str
    katz_answers: dict | None
    contributing: dict | None
    sppb_balance: int | None
    sppb_gait: int | None
    sppb_chair: int | None
    issues: list[str] | None
    katz_total: int | None
    cfs_score: int | None
    sppb_total: int | None
    frailty_tier: str | None
    risk_explanation: str | None
    previous_tier: str | None
    tier_changed: bool
    new_plans: list[dict]
    alerts: list[dict]
    health_snapshot_id: int | None
    assessment_id: int | None
    db: AsyncSession | None
```

---

## LangGraph Detail: Chat Graph

**File:** `backend/app/services/langgraph_agents/chat_graph.py`

### Nodes

#### 1. Context Assembly Node (deterministic)
- Calls `build_user_context()` → queries health_snapshots, frailty_evaluations, care_plans, assessments, exercise_logs, alerts
- Serializes via `to_system_prompt_context()` into Gemini system prompt

#### 2. Agent Node (LLM — 1-5 LLM calls)
- Model: `gemini-2.5-flash` (orchestrator), `gemini-2.5-flash-lite` (sub-agents)
- System prompt includes full UserContext
- Loads last 10 chat messages for conversation history
- Uses Gemini native function calling with TOOL_DECLARATIONS
- If Gemini returns a function_call → executes sub-agent → second Gemini call to synthesize

#### 3. Safety Gate Node (deterministic)
- Pattern matches on user message:
  ```
  "I fell" / "fell down"          → alert(fall_reported, urgent)
  "chest pain" / "can't breathe"  → alert(emergency, urgent) + "Please call 995"
  "want to die" / "hopeless"      → alert(emergency, urgent) + crisis helplines
  ```
- Appends safety info to response (does not replace it)

#### 4. Persist Node (deterministic)
- INSERT chat_messages for user + assistant
- Stores tool_calls JSON if tools were used

### Chat Tools (Gemini Function Calling)

Gemini calls these tools via native function calling. Four invoke LLM sub-agents; two are deterministic:

| Tool | What it does | LLM |
|---|---|---|
| `get_exercise_plan()` | Calls Exercise Agent → personalized program based on tier/SPPB/deficits | 1 Gemini Flash Lite |
| `get_sleep_advice()` | Calls Sleep Agent → CBT-I + sleep hygiene plan | 1 Gemini Flash Lite |
| `get_education(topic)` | Calls Education Agent → frailty/balance/nutrition education | 1 Gemini Flash Lite |
| `analyze_trends()` | Calls Monitoring Agent → health trend analysis | 1 Gemini Flash Lite |
| `get_progress_summary()` | Computes SPPB/Katz trends, exercise streak | 0 (deterministic) |
| `alert_caregiver(message)` | INSERT alert with severity=warning | 0 (deterministic) |

### State Schema

```python
class ChatState(TypedDict, total=False):
    user_id: str
    user_message: str
    language: str
    system_prompt: str | None
    user_context: UserContext | None
    agent_response: str | None
    tool_calls: list[dict] | None
    safety_alerts: list[dict]
    response_appendix: str | None
    db: AsyncSession | None
```

---

## Deterministic Services

### Scoring (`backend/app/services/scoring.py`)

```python
score_katz(answers: dict[str, bool]) -> int          # 0-6, higher = more independent
score_cfs(katz_total: int) -> int                     # 1-9, CFS estimate
score_sppb(balance: int, gait: int, chair: int) -> int  # 0-12
classify_frailty(cfs, katz, sppb) -> (tier, explanation)
route_care(tier, risks) -> list[str]                  # which care pathways to activate
generate_narrative(tier, cfs, katz, sppb, ...) -> str # human-readable explanation
```

### Content Library (`backend/app/services/content_library.py`)

Pre-written, expert-reviewed content. NOT LLM-generated.

- `EXERCISE_PLANS` — by tier (robust/pre_frail/frail/severely_frail)
- `DEFICIT_EXERCISES` — by deficit (low_balance/slow_gait/weak_chair_stand)
- `SLEEP_CONTENT` — by risk level (low/moderate/high)
- `EDUCATION_CONTENT` — by topic (frailty/balance/falls_prevention/nutrition) + tier
- `MONITORING_TEMPLATES` — by tier

### UserContext (`backend/app/services/context.py`)

`build_user_context(db, user_id)` queries all tables in one batch:
1. User identity
2. Latest health_snapshot → risks, CFS, Katz
3. Latest frailty_evaluation → tier
4. Active care_plans
5. Latest assessment → SPPB sub-scores, issues
6. SPPB trend (last 5) + direction
7. Katz trend (last 3)
8. Tier history (last 5)
9. Exercise stats (streak, weekly, today)
10. Unread alerts

`to_system_prompt_context()` serializes all of this into text for the Chat Agent.

---

## User Journey & Graph Integration

### Phase 1: Onboarding (0 LLM calls)
1. Welcome → Name + language
2. Katz ADL → 6 yes/no questions (TTS/STT supported)
3. Contributing Conditions → 4 three-option questions
4. POST `/api/users/{id}/health-snapshot` → Assessment Graph (trigger="onboarding")
5. Score → Classify → Update Plans → Persist

### Phase 2: First Assessment (1 LLM call — Gemini video)
1. Video recording (balance → gait → chair stand)
2. Gemini 2.5 Flash → SPPB sub-scores
3. Assessment Graph (trigger="assessment") → complete tier with all scores

### Phase 3: Daily Routine (1 LLM call — Gemini video)
- Morning: assessment → exercises from personalized plan
- Assessment Graph runs each time; most days tier unchanged → short path

### Phase 4: Chat (1-5 LLM calls per turn)
- Chat Graph: context assembly → Gemini agent → safety gate → persist
- Gemini function calling dispatches to management sub-agents when needed

### Phase 5: Profile Updates (0 LLM calls)
- Via UI or chat `update_profile` tool
- Triggers Assessment Graph (trigger="profile_update")

### Phase 6: Caregiver View
- CaregiverPage shows clinical detail: tier, CFS, Katz, SPPB, risk explanation, alerts, care plans

---

## LLM Call Budget

| Scenario | Gemini Video | Assessment Graph | Chat Graph | Total |
|---|---|---|---|---|
| Onboarding | 0 | 0 | 0 | **0** |
| Assessment (no tier change) | 1 | 0 | 0 | **1** |
| Assessment (tier change) | 1 | 0 | 0 | **1** |
| Chat turn (no tool) | 0 | 0 | 1 | **1** |
| Chat turn (with sub-agent) | 0 | 0 | 2-3 | **2-3** |
| Profile update (UI) | 0 | 0 | 0 | **0** |

---

## Database Schema

### Core Tables

```sql
users (id, display_name, date_of_birth, gender, language, created_at, onboarded_at)

health_snapshots (id, user_id, captured_at, trigger,
    katz_bathing, katz_dressing, katz_toileting, katz_transferring, katz_continence, katz_feeding, katz_total,
    cognitive_risk, mood_risk, sleep_risk, social_isolation_risk,
    cfs_score, cfs_label, notes)

assessments (id, user_id, timestamp, test_type, completed_tests,
    balance_score, gait_score, chair_stand_score, sppb_total,
    confidence, issues, recommendations, pose_metrics)

frailty_evaluations (id, user_id, timestamp, trigger,
    health_snapshot_id, assessment_id,
    cfs_score, katz_total, sppb_total,
    frailty_tier, risk_explanation, tier_changed, previous_tier)

care_plans (id, user_id, plan_type, content, created_at, status, superseded_by_id, trigger)

agent_runs (id, user_id, timestamp, graph_type, trigger, input_summary, output_summary, nodes_executed, elapsed_seconds)

exercise_logs (id, user_id, date, exercise_id, completed, duration_seconds, reps, form_score, logged_at)

chat_messages (id, user_id, role, content, tool_calls, language, timestamp)

alerts (id, user_id, timestamp, alert_type, severity, message, source, read)
```

### Key Design Decisions

1. **health_snapshots is append-only** — never UPDATE, always INSERT (enables diffs, trends, audit trail)
2. **frailty_evaluations links its inputs** — FK to health_snapshot_id + assessment_id (full traceability)
3. **care_plans have lifecycle** — active → superseded, with superseded_by_id pointer
4. **care_plans content is NOT LLM-generated** — selected from content_library.py
5. **agent_runs tracks graph executions** — which graph, which nodes, what outcome
6. **alerts have source field** — assessment_graph vs chat_safety_gate vs system

---

## Event-Driven Triggers

```
ONBOARDING COMPLETE     → POST /health-snapshot → Assessment Graph (trigger=onboarding)
VIDEO ASSESSMENT        → POST /assessment/analyze-stream → Assessment Graph (trigger=assessment)
PROFILE UPDATE          → POST /health-snapshot → Assessment Graph (trigger=profile_update)
BIWEEKLY RECHECK        → POST /health-snapshot → Assessment Graph (trigger=biweekly_recheck)
CHAT MESSAGE            → POST /chat/stream → Chat Graph
DAILY SYSTEM CHECK      → Cron: check exercise_logs + health_snapshots → alerts
```
