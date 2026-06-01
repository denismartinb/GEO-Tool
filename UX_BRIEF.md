UX_BRIEF.md
GEO Studio
UX Brief v0.1
Status: MVP Design Direction Product: GEO Studio Audience: Claude Design / Product Design Author: Denis Martín Barroso

1. Product Summary
GEO Studio is a SaaS platform for Generative Engine Optimization.
It helps companies, SEO agencies and marketing teams understand, monitor and improve their visibility inside AI-generated answers.
The product analyzes:
	•	Whether a brand appears in AI answers.
	•	Which prompts mention the brand.
	•	Which competitors appear more often.
	•	Which URLs are cited as sources.
	•	What gaps prevent the brand from being mentioned or cited.
	•	What actions the user should implement first.
The core product idea is:
From AI Visibility to Implementation
GEO Studio should not feel like a passive reporting dashboard.
It should feel like an actionable command center for improving AI visibility.

2. Product Positioning
GEO Studio is not trying to copy Semrush or Otterly.
It should be inspired by the clarity and analytical structure of enterprise SEO tools, but the key differentiator is actionability.
The product should help the user move from:
“I do not know if AI engines mention my brand”
to:
“I know where I appear, where competitors are winning, why they are winning, and what I should change first.”

3. Target Users
Primary Users
	•	SEO agencies.
	•	Growth agencies.
	•	SEO consultants.
	•	Digital marketing consultants.
Secondary Users
	•	B2B companies.
	•	SaaS companies.
	•	Specialized ecommerce brands.
	•	Companies dependent on organic acquisition.
Main Personas
Operator
The person who uses the tool frequently.
Examples:
	•	SEO Manager.
	•	Growth Manager.
	•	Content Manager.
	•	Digital Marketing Manager.
	•	Consultant.
Needs:
	•	Clear data.
	•	Actionable recommendations.
	•	Evidence.
	•	Exportable insights.
	•	Prioritized work.
Executive
The person who wants to understand the business impact.
Examples:
	•	CMO.
	•	Marketing Director.
	•	Founder.
	•	Digital Director.
Needs:
	•	Executive summary.
	•	Competitive position.
	•	Trend.
	•	Opportunities.
	•	Clear next actions.

4. MVP Scope
The MVP should support the following product areas:
	1	Project creation.
	2	Domain, country, language and brand setup.
	3	Competitor management.
	4	Prompt management.
	5	AI visibility scan results.
	6	Basic visibility scores.
	7	Prompt-level analysis.
	8	Competitor comparison.
	9	Citation analysis.
	10	Recommendations.
	11	Generated solutions later.
The current design phase should focus only on the core dashboard experience, not on every future feature.

5. Screens Needed in MVP
The MVP will eventually include:
	•	Dashboard home.
	•	Projects list.
	•	Project detail.
	•	Overview.
	•	Prompts.
	•	Competitors.
	•	Runs.
	•	Recommendations.
	•	Generated Solutions.
For the first design iteration, focus on:
	1	App layout.
	2	Sidebar navigation.
	3	Project Overview.
	4	Recommendations Center.
	5	Empty states.
	6	Loading states.
	7	Error states.
Do not design advanced settings, billing, teams, API, browser extension or CMS integrations.

6. UX Principles
6.1 Action Over Data
Every insight should lead to a decision or action.
Avoid dashboards that only display metrics without telling the user what to do next.
Bad:
“Visibility Score: 42”
Better:
“Your brand is mentioned in 18% of selected prompts. Competitors appear 2.4x more often. Start with these 3 actions.”

6.2 Simple First
The user should understand the project status in less than 30 seconds.
The overview should answer:
	•	How visible is my brand?
	•	Am I winning or losing against competitors?
	•	Where are my biggest gaps?
	•	What should I do first?

6.3 Explain GEO Everywhere
GEO is a new discipline.
The interface should explain concepts contextually.
Use:
	•	Tooltips.
	•	Helper text.
	•	“Why this matters” cards.
	•	Empty states.
	•	Inline explanations.
	•	Short educational copy.
Avoid long educational pages inside the MVP.
Education should be embedded in the workflow.

6.4 Evidence-Based Recommendations
Recommendations must feel credible.
Each recommendation should include:
	•	What the problem is.
	•	Why it matters.
	•	Evidence.
	•	Impact.
	•	Effort.
	•	Confidence.
	•	SEO risk if relevant.
	•	Suggested action.

6.5 Progressive Disclosure
Show the executive summary first.
Allow deeper exploration only when needed.
The UI should avoid overwhelming the user with all data at once.

7. Product Tone
The product should feel:
	•	Premium.
	•	Clear.
	•	Trustworthy.
	•	Strategic.
	•	Modern.
	•	Analytical.
	•	Action-oriented.
	•	Enterprise-ready but not heavy.
Avoid:
	•	Playful startup gimmicks.
	•	Overly colorful dashboards.
	•	Excessive gradients.
	•	Dense SEO-tool clutter.
	•	Generic AI-app aesthetics.

8. Visual Direction
Desired style:
	•	Premium SaaS.
	•	Clean analytical interface.
	•	Light mode first.
	•	Dark mode possible later.
	•	Elegant cards.
	•	Strong information hierarchy.
	•	Clear typography.
	•	Subtle borders.
	•	Calm neutral background.
	•	Carefully used accent color.
	•	Excellent tables.
	•	High-quality empty states.
Inspirations:
	•	Semrush Enterprise for analytical dashboard structure.
	•	Linear for clarity and density.
	•	Vercel for clean technical elegance.
	•	Attio for modern SaaS polish.
	•	Stripe for trust and clarity.
The product should not visually copy any of these tools.
Use them only as inspiration.

9. Suggested Information Architecture
Sidebar
Recommended navigation:
	•	Overview.
	•	Prompts.
	•	Competitors.
	•	Runs.
	•	Recommendations.
	•	Generated Solutions.
	•	Settings.
For MVP, Generated Solutions and Settings can appear as disabled or future sections if needed.

Project Header
Each project page should show:
	•	Project name.
	•	Domain.
	•	Country.
	•	Language.
	•	Last scan status.
	•	Last updated date.
	•	Primary action button: “Run scan” or “Start analysis”.

10. Project Overview Screen
The Project Overview is the main executive screen.
It should include:
Top Summary
A short natural language summary:
Your brand appears in 18% of selected AI prompts. Your strongest competitor appears in 43%. GEO Studio found 5 high-impact actions to improve citation readiness.
Main Score Cards
Suggested cards:
	1	GEO Visibility Score.
	2	Mention Rate.
	3	Citation Rate.
	4	Competitor Gap.
	5	Confidence.
Each card should include:
	•	Metric.
	•	Short explanation.
	•	Trend if available.
	•	Visual status.
Competitive Snapshot
Show:
	•	Brand.
	•	Main competitors.
	•	Mention rate.
	•	Citation rate.
	•	Share of AI Voice.
Prompt Opportunities
Show prompts where:
	•	Competitors appear and the brand does not.
	•	Competitors are cited and the brand is not.
	•	The prompt has high commercial value.
Top Recommendations
Show the top 3-5 recommendations.
Each recommendation card should include:
	•	Priority.
	•	Title.
	•	Impact.
	•	Effort.
	•	Confidence.
	•	Evidence preview.
	•	CTA: “View recommendation”.

11. Recommendations Center
The Recommendations Center is the heart of the product.
It should feel like a prioritized action backlog.
Layout
Recommended structure:
	•	Header with summary.
	•	Filters.
	•	Priority list/table.
	•	Detail panel or expandable row.
Recommendation Card Fields
Each recommendation should show:
	•	Priority rank.
	•	Title.
	•	Category/type.
	•	Impact.
	•	Effort.
	•	Confidence.
	•	Status.
	•	Evidence.
	•	Suggested action.
	•	CTA.
Example Recommendation
Title:
Add citation-ready FAQ content for high-value comparison prompts
Problem:
Competitors are mentioned in 7 comparison prompts where your brand does not appear.
Why it matters:
AI engines often use clear, structured answers when generating recommendation-style responses.
Evidence:
Competitor X was cited in 4 prompts related to “best GEO tools”.
Suggested action:
Add a structured FAQ section and a concise comparison block to the target landing page.
CTA:
Generate suggested content

12. Prompt Explorer
This screen can be designed later, but the information model should support:
	•	Prompt text.
	•	Intent.
	•	Brand mentioned.
	•	Competitors mentioned.
	•	Citations.
	•	Sentiment.
	•	Status.
	•	Last run.
	•	Opportunity.
The design should make prompt-level analysis easy to scan.

13. Competitors Screen
This screen should support:
	•	Competitor list.
	•	Domain.
	•	Active/inactive state.
	•	Mention rate.
	•	Citation rate.
	•	Difference vs own brand.
For MVP, competitor editing can be simple.

14. Runs Screen
This screen should support:
	•	Scan history.
	•	Status.
	•	Date.
	•	Number of prompts.
	•	Successful prompts.
	•	Failed prompts.
	•	Scores.
	•	Error state.
For MVP, keep this simple.

15. Empty States
Empty states are very important because many users will enter a new project with no data.
No Projects
Message:
Create your first GEO project
Supporting copy:
Add a domain, brand, country and language to start monitoring how AI engines understand your market.
CTA:
Create project

No Prompts
Message:
Add the prompts you want to monitor
Supporting copy:
Prompts are the questions users may ask AI engines when looking for solutions like yours.
CTA:
Add prompt

No Competitors
Message:
Add your main competitors
Supporting copy:
GEO Studio compares your brand against competitors to detect where they are winning visibility.
CTA:
Add competitor

No Runs
Message:
Run your first AI visibility scan
Supporting copy:
GEO Studio will analyze selected prompts, detect mentions, citations and competitive gaps.
CTA:
Run scan

No Recommendations
Message:
No recommendations yet
Supporting copy:
Recommendations will appear after your first visibility scan has been analyzed.

16. Loading States
The product should show progress clearly.
Examples:
	•	Creating project.
	•	Saving prompt.
	•	Running scan.
	•	Extracting AI responses.
	•	Computing scores.
	•	Generating recommendations.
Avoid vague loading states.
Better:
Running selected prompts…
Extracting mentions and citations…
Computing GEO visibility score…

17. Error States
Errors should be calm, specific and actionable.
Examples:
Scan Failed
The scan could not be completed
Supporting copy:
Some prompts failed during execution. Raw responses and logs were preserved where available.
CTA:
View run details
Prompt Failed
This prompt failed to run
Supporting copy:
You can retry it later. Other prompt results are still available.

18. Microcopy Guidelines
Use clear, confident language.
Avoid jargon unless explained.
Prefer:
	•	“AI visibility”
	•	“Brand mentions”
	•	“Cited URLs”
	•	“Competitor gap”
	•	“Recommended actions”
	•	“Evidence”
Avoid unexplained acronyms.
When using “GEO”, explain it early:
GEO means optimizing your brand and content for visibility inside AI-generated answers.

19. Key Metrics Glossary
GEO Visibility Score
A summary score estimating how visible the brand is across selected AI prompts.
Mention Rate
The percentage of selected prompts where the brand appears.
Citation Rate
The percentage of AI responses that cite the brand’s domain.
Competitor Gap
How much visibility competitors have in prompts where the brand is missing or weaker.
Confidence
How reliable the insight is based on available scan data.

20. Design Constraints
Do not design:
	•	Billing.
	•	Teams.
	•	API management.
	•	Browser extension.
	•	CMS integrations.
	•	Advanced settings.
	•	Enterprise admin.
	•	Public reports.
	•	White label.
	•	Deep technical audit screens.
These are future product areas.

21. First Design Request
For the first design iteration, produce:
	1	Visual direction.
	2	Light design system.
	3	App shell.
	4	Sidebar.
	5	Project Overview screen.
	6	Recommendations Center screen.
	7	Empty states.
	8	Loading states.
	9	Error states.
	10	UX rationale.
Focus on a premium, credible, actionable SaaS experience.
Do not create a generic dashboard.
Make GEO Studio feel like a real product that agencies and B2B marketing teams would pay for.

22. Final Design Principle
Every screen should answer:
What should the user understand or do next?
If a component does not help the user understand, decide or act, it should not be in the MVP.
