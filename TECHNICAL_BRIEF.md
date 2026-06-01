TECHNICAL_BRIEF.md
GEO Studio
Technical Brief v0.1
Status
Pre-implementation Architecture Phase
Author
Denis Martín Barroso

Mission
Build a SaaS platform called GEO Studio.
The goal is to help companies understand, monitor and improve their visibility inside AI search and answer engines.
The platform must not behave like a traditional reporting dashboard.
The primary objective is:
Convert AI visibility insights into prioritized implementation actions.
The product should answer:
	1	Does my brand appear in AI-generated answers?
	2	Which competitors appear more often?
	3	Which URLs are cited by AI systems?
	4	Why are competitors being cited instead of me?
	5	What should I change first?
	6	Can the platform generate implementation-ready solutions?

Product Positioning
GEO Studio is not trying to replicate Semrush.
GEO Studio is not trying to replicate Otterly.
The first version should focus on:
	•	GEO Audit
	•	AI Visibility Monitoring
	•	Competitor Gap Detection
	•	Recommendation Engine
	•	Solution Generation
The product must be highly actionable.
Every insight should lead to a recommendation.
Every recommendation should contain evidence.

Development Constraints
This product is being built by a single founder using AI-assisted development.
Assume:
	•	Solo developer
	•	Vibecoding workflow
	•	Limited engineering bandwidth
	•	Need for fast iteration
	•	Need for cost control
Avoid:
	•	Overengineering
	•	Microservices
	•	Kubernetes
	•	Complex infrastructure
	•	Premature scaling
Prefer:
	•	Simple architecture
	•	Strong foundations
	•	Progressive enhancement
	•	High observability
	•	Robust data model

Preferred Stack
Frontend
	•	Next.js
	•	React
	•	TypeScript
	•	Tailwind
	•	shadcn/ui
Backend
	•	Next.js API routes
	•	Server Actions when appropriate
Database
	•	Supabase Postgres
Authentication
	•	Supabase Auth
Storage
	•	Supabase Storage
Scheduling
	•	Supabase Cron
	•	Alternative lightweight scheduler if necessary
Crawling
Start simple:
	•	HTTP fetch
	•	HTML parsing
Later:
	•	Playwright
Parsing
	•	Cheerio
	•	Readability-like extraction
LLM Layer
Use structured outputs.
All LLM responses used by the system must be JSON-schema validated.
No free-form outputs should drive business logic.

Core Product Flow
Step 1
User creates a project.
Inputs:
	•	Domain
	•	Brand
	•	Country
	•	Language

Step 2
System discovers competitors.
User can edit them.

Step 3
System generates GEO prompts.
User selects prompts.

Step 4
System executes visibility scans.

Step 5
System extracts:
	•	Brand mentions
	•	Competitor mentions
	•	Citations
	•	Sentiment
	•	Mention position

Step 6
System crawls domain.

Step 7
System audits content and technical factors.

Step 8
System generates recommendations.

Step 9
System generates implementation-ready solutions.

Step 10
System monitors changes periodically.

MVP Functional Modules
Project Setup
Create and manage projects.

Competitor Discovery
Suggest competitors.
User can edit.

Prompt Research
Generate GEO prompts.
Categorize them.
Prioritize them.

AI Visibility
Run prompts.
Store responses.
Extract signals.

Citation Intelligence
Track cited URLs.
Track cited domains.
Track source ownership.

GEO Audit
Analyze:
	•	crawlability
	•	schema
	•	content structure
	•	FAQs
	•	entities
	•	citation readiness

Recommendation Engine
Transform findings into actions.

Solution Generator
Generate:
	•	FAQ sections
	•	Schema markup
	•	Content briefs
	•	Citation blocks
	•	Technical tickets

Non Functional Requirements
Reliability
Every long-running task must have:
	•	status
	•	retries
	•	logs
	•	timestamps

Traceability
Store:
	•	raw responses
	•	processed responses
	•	scoring versions
	•	extraction versions

Cost Control
Limit:
	•	prompts
	•	crawl depth
	•	scan frequency
Cache aggressively when possible.

Observability
Track:
	•	jobs
	•	failures
	•	retries
	•	latency
	•	token usage
	•	estimated costs

Architecture Goals
The architecture should:
	1	Be understandable by a solo developer.
	2	Be deployable quickly.
	3	Be maintainable.
	4	Be observable.
	5	Be easy to evolve.
	6	Support future API and plugin expansion.
	7	Support periodic monitoring.
	8	Support historical data.

Required Output
Analyze this brief and the attached PRD.
Do NOT generate code.
Instead provide:
	1	Architecture proposal.
	2	System components.
	3	Repository structure.
	4	Database design.
	5	Job system design.
	6	Crawling architecture.
	7	LLM orchestration strategy.
	8	Scoring architecture.
	9	Recommendation architecture.
	10	Monitoring architecture.
	11	Cost control strategy.
	12	Risk analysis.
	13	Suggested implementation order.
	14	Development phases.
	15	Acceptance criteria for each phase.
Think as the founding engineer of this startup.
Optimize for simplicity, robustness and speed of execution.
Avoid unnecessary complexity.
Challenge assumptions when appropriate.
Propose a better solution if one exists.
