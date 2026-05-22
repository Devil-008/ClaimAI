# Claims Automation Agent — Activity Tracker

## ✅ STEP 1 — Database (MySQL) [2026-05-18]
**Status: Complete — Run manually in MySQL Workbench**

### Files Created
| File | Purpose |
|------|---------|
| `database/01_schema.sql` | Full schema — 16 tables |
| `database/02_seed_data.sql` | Demo data for all 5 personas |

### Tables Created
| # | Table | Maps To |
|---|-------|---------|
| 1 | `users` | Multi-persona auth (policyholder / adjuster / siu_investigator / supervisor / it_ops) |
| 2 | `policies` | A3 Coverage Verification |
| 3 | `claims` | Master claim record — A1 Orchestrator state machine |
| 4 | `fnol_submissions` | A2 FNOL Intake Agent |
| 5 | `coverage_verifications` | A3 Coverage Verification Agent |
| 6 | `damage_assessments` | A4 Damage Assessment Agent |
| 7 | `fraud_risk_scores` | A5 Fraud & Risk Scoring Agent |
| 8 | `settlements` | A6 Settlement Agent |
| 9 | `adjuster_handoffs` | A7 Adjuster Handoff Agent |
| 10 | `siu_investigations` | SIU Investigator persona |
| 11 | `chat_sessions` + `chat_messages` | A8 Claimant Chatbot Agent |
| 12 | `agent_workflow_runs` | A1 Orchestrator state tracking |
| 13 | `audit_logs` | Immutable audit trail |
| 14 | `kpi_snapshots` | Supervisor dashboard metrics |
| 15 | `system_health` | IT/Ops monitoring |
| 16 | `notifications` | In-app + email/SMS/push |

### Personas & Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Policyholder | arjun@demo.com | password123 |
| Policyholder 2 | priya@demo.com | password123 |
| Claims Adjuster | rahul@demo.com | password123 |
| SIU Investigator | kavita@demo.com | password123 |
| Supervisor | deepak@demo.com | password123 |
| IT / Ops | anil@demo.com | password123 |

> **Note:** Run `agent/seed_passwords.py` from the `API/` folder after SQL seed to bcrypt-hash demo passwords.

---

## ✅ STEP 2 — Frontend UI (React + Vite) [2026-05-18]
**Status: Complete — `npm run dev` running on http://localhost:5173**

### Tech Stack
- React 18 + Vite 5
- React Router v6
- Framer Motion (animations)
- Zustand (state management with persistence)
- Axios (API calls with interceptors)
- Lucide React (icons)
- React Hot Toast (notifications)

### Files Created
| File | Purpose |
|------|---------|
| `UI/src/index.css` | Global design system (dark theme, CSS variables, utilities) |
| `UI/src/App.jsx` | Root router — `/`, `/login`, `/dashboard/*` with auth guard |
| `UI/src/store/authStore.js` | Zustand auth store (token + user, persisted to localStorage) |
| `UI/src/services/api.js` | Axios instance with Bearer token interceptor + 401 auto-logout |
| `UI/src/pages/LandingPage.jsx` | Single premium landing page |
| `UI/src/pages/LoginPage.jsx` | 2-step login: persona selector → credentials form |
| `UI/src/pages/Dashboard.jsx` | Dashboard shell with role-based page routing |
| `UI/src/pages/Dashboard.css` | Shared dashboard styles (stat cards, tables, layout) |
| `UI/src/components/Sidebar.jsx` | Role-aware sidebar navigation |
| `UI/src/components/TopBar.jsx` | Top header with search + notifications |
| `UI/src/pages/dashboard/PolicyholderHome.jsx` | Policyholder — my claims + pipeline tracker |
| `UI/src/pages/dashboard/AdjusterHome.jsx` | Adjuster — claim queue + AI reasoning trace |
| `UI/src/pages/dashboard/SIUHome.jsx` | SIU — fraud cases + score breakdown |
| `UI/src/pages/dashboard/SupervisorHome.jsx` | Supervisor — KPI cards + agent performance matrix |
| `UI/src/pages/dashboard/ITOpsHome.jsx` | IT/Ops — system health table + live log panel |

### Persona Dashboards
| Persona | Color | Dashboard Focus |
|---------|-------|-----------------|
| Policyholder | Cyan `#06B6D4` | My Claims, File New Claim, Pipeline Status |
| Claims Adjuster | Indigo `#4F46E5` | Escalated Queue, Approve/Reject, AI Trace |
| SIU Investigator | Purple `#8B5CF6` | Fraud Cases, Risk Scores, Red Flags |
| Supervisor | Green `#10B981` | KPI Cards, STP Rate Chart, Agent Perf Matrix |
| IT / Ops | Amber `#F59E0B` | Service Health, Latency, CPU/Mem, Live Logs |

---

## ✅ STEP 3 — Backend API (FastAPI + SQLAlchemy) [2026-05-18]
**Status: Structure complete — needs `pip install -r requirements.txt` + `.env` config**

### Files Created
| File | Purpose |
|------|---------|
| `API/main.py` | FastAPI app entry, CORS, router registration |
| `API/requirements.txt` | Python dependencies |
| `API/.env` | Environment config template |
| `API/app/core/config.py` | Pydantic Settings |
| `API/app/core/security.py` | JWT create/decode, bcrypt hash/verify |
| `API/app/database/connection.py` | SQLAlchemy engine + SessionLocal + get_db |
| `API/app/models/models.py` | ORM models (User, Policy, Claim, FNOLSubmission, etc.) |
| `API/app/controllers/auth_controller.py` | POST /api/auth/login, GET /api/auth/me |
| `API/app/controllers/claims_controller.py` | CRUD /api/claims — role-filtered |
| `API/app/controllers/dashboard_controller.py` | /api/dashboard/kpi, /system-health, /claim-stats |

### API Endpoints (so far)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | ❌ | Login → JWT token |
| GET | `/api/auth/me` | ✅ | Current user info |
| GET | `/api/claims/` | ✅ | List claims (role-filtered) |
| GET | `/api/claims/{id}` | ✅ | Single claim detail |
| POST | `/api/claims/` | ✅ Policyholder | File new claim |
| GET | `/api/dashboard/kpi` | ✅ Supervisor/Ops | KPI snapshots |
| GET | `/api/dashboard/system-health` | ✅ | Latest health per service |
| GET | `/api/dashboard/claim-stats` | ✅ | Aggregate claim counts |
| GET | `/api/health` | ❌ | API health check |

---

## 🔜 NEXT STEPS (Step 4+)

- [ ] **Run DB**: Execute `01_schema.sql` → `02_seed_data.sql` in MySQL Workbench
- [ ] **Hash passwords**: `cd API && python agent/seed_passwords.py`
- [ ] **Start API**: `cd API && pip install -r requirements.txt && uvicorn main:app --reload`
- [ ] **Wire UI to real API**: Replace mock data in dashboard pages with `api.get()` calls
- [ ] **FNOL Wizard**: Multi-step claim submission form for policyholders
- [ ] **Agent A1–A8 stubs**: Placeholder agent service layer in `API/app/agents/`
- [ ] **Adjuster actions**: Approve/Reject API endpoints
- [ ] **SIU investigation submit**: POST /api/siu-investigations
- [ ] **Notifications**: In-app notification panel
