# GrowthOS

## 1. Product vision

Build an autonomous growth and distribution platform for SaaS products.

The system should allow a founder to provide a SaaS URL and a growth objective, after which the platform analyzes the product, identifies target audiences, creates a marketing strategy, produces platform-native content, distributes that content through supported channels, tracks conversions, learns from results, and progressively improves its strategy.

The long-term product promise is:

> Add your SaaS, define your growth goal, and let GrowthOS continuously find the right audience and help distribute your product to them.

The system must NOT behave like a spam bot.

It should prioritize:

- relevance;
- useful content;
- platform-native behavior;
- audience quality;
- conversion quality;
- platform rules;
- account safety;
- sustainable audience growth.

The system should explicitly avoid:

- mass-follow/unfollow behavior;
- artificial engagement;
- fake personas pretending to be customers;
- fake testimonials;
- automated voting;
- repetitive comments;
- indiscriminate link posting;
- attempts to bypass platform moderation or rate limits.

---

# 2. Initial use case

The first version is an internal tool used by one founder to promote multiple SaaS products.

Do NOT initially build for external customers.

Avoid premature features such as:

- billing;
- teams;
- complex permissions;
- enterprise authentication;
- white-labeling;
- multi-tenant architecture;
- elaborate onboarding.

The founder should be able to operate several products from one dashboard.

Example:

```text
Products

Orbit Jobs          ● Active
Clinic SaaS         ● Active
Product #3          ○ Paused
```

---

# 3. Core user workflow

The primary workflow should be:

```text
Add SaaS URL
      ↓
Analyze product
      ↓
Review Product Profile
      ↓
Define Growth Mission
      ↓
Identify audiences
      ↓
Develop content strategy
      ↓
Generate content
      ↓
Schedule / approve
      ↓
Publish
      ↓
Track visits/conversions
      ↓
Analyze results
      ↓
Improve future strategy
```

The system must preserve historical decisions and content so that the AI does not behave statelessly.

---

# 4. Growth Mission

Users should not primarily tell the system:

> Post five times per week.

Instead they define a business objective.

Examples:

```text
Get the first 100 users.

Generate 500 qualified signups this month.

Reach 10,000 LATAM software engineers.

Grow to 5,000 relevant followers.

Generate 50 paid customers.
```

Represent this as a `GrowthMission`.

Suggested fields:

```ts
GrowthMission {
  id
  productId

  name

  objectiveType
  targetValue
  currentValue

  primaryConversion
  secondaryConversion

  targetDate?

  status

  strategyNotes

  createdAt
  updatedAt
}
```

---

# 5. Product Intelligence

When a SaaS URL is added, analyze the website.

Extract and infer:

- product name;
- description;
- primary problem solved;
- target users;
- industries;
- use cases;
- value proposition;
- differentiators;
- pricing;
- calls to action;
- competitors if detectable;
- important keywords;
- possible objections;
- content themes.

Store the result permanently as a `ProductProfile`.

The user must be able to edit AI-generated assumptions.

Example:

```text
Product: Orbit Jobs

Problem:
LATAM developers waste time applying to supposedly remote jobs that cannot actually hire them.

Primary audiences:
- LATAM software engineers
- senior developers
- remote-job seekers

Value propositions:
- hiring eligibility
- job matching
- compensation intelligence
- international hiring information
```

Do not repeatedly crawl the website unless required.

---

# 6. Audience Intelligence

Create an audience model.

Each product can contain multiple audience segments.

Example:

```text
Senior LATAM Backend Developers

Audience fit: 95
Problem intensity: 90
Conversion potential: 88
Current reach: Low
```

Suggested model:

```ts
AudienceSegment {
  id
  productId

  name
  description

  locations[]
  professions[]
  seniority[]
  interests[]
  painPoints[]
  keywords[]

  audienceFitScore
  problemIntensityScore
  conversionPotentialScore

  status

  createdAt
  updatedAt
}
```

The system should eventually learn which segments convert better.

Do not optimize purely for follower count.

Introduce the concept:

```text
Qualified Audience
```

A follower who matches the ICP is more valuable than an unrelated follower.

---

# 7. Audience Growth Engine

Create a future subsystem responsible for growing relevant audiences.

Its goal is NOT:

```text
gain as many followers as possible
```

Its goal is:

```text
increase exposure among people likely to become customers
```

It should identify:

- relevant conversations;
- communities;
- creators;
- newsletters;
- recurring questions;
- emerging topics;
- content opportunities;
- high-affinity audience clusters.

Eventually calculate an Audience Affinity Score.

Conceptually:

```text
Affinity =
Audience relevance
× problem relevance
× engagement opportunity
× product fit
× channel suitability
```

Exact formula can evolve later.

---

# 8. Opportunity Discovery Engine

The system should eventually continuously discover potential opportunities.

Examples:

```text
Someone asks:
"Why do US remote jobs only hire US residents?"

Potential fit:
Orbit Jobs

Suggested response:
Educational explanation about geographic hiring restrictions.
```

Or:

```text
Creator with relevant audience published:
"Best places to find international remote jobs"

Audience overlap: 91%

Potential action:
Respond with original hiring data.
```

An opportunity should contain:

```ts
Opportunity {
  id
  productId

  channel
  sourceUrl?

  type
  title
  summary

  audienceSegmentId?

  relevanceScore
  riskScore
  potentialValueScore

  suggestedAction

  status
  discoveredAt
}
```

Initial MVP does NOT need automatic web-wide monitoring.

Design the architecture so this can be added later.

---

# 9. Content Strategy Engine

Do NOT simply generate random social posts.

Create a hierarchy:

```text
Growth Mission
     ↓
Campaign
     ↓
Content Theme
     ↓
Content Idea
     ↓
Platform-specific Post
```

Example:

```text
Mission
Get 1,000 LATAM developers

Campaign
Remote Isn't Global

Content Theme
Geographic hiring restrictions

Content Idea
Analyze how many remote jobs actually accept LATAM applicants

Outputs
LinkedIn post
Bluesky post
Reddit discussion
Blog article
Instagram carousel
```

---

# 10. Content types

Support reusable content angles.

Examples:

- educational;
- data insight;
- problem explanation;
- contrarian insight;
- comparison;
- case study;
- customer story;
- product update;
- industry observation;
- tutorial;
- question;
- research;
- original dataset insight;
- founder/building story where appropriate.

The Content Engine should intentionally rotate formats rather than merely paraphrase previous posts.

---

# 11. Content Atomization

One valuable idea should create multiple assets.

Example:

```text
Research:
Remote Hiring LATAM 2026

        ↓

Blog article
LinkedIn posts
Bluesky posts
Reddit discussion
Charts
Instagram carousel
Newsletter
```

Represent the original idea separately from platform posts.

Suggested entities:

```ts
ContentIdea
ContentAsset
SocialPost
```

This prevents duplicate strategy logic.

---

# 12. Distribution Engine

Build channel adapters.

Use an interface such as:

```ts
interface DistributionChannel {
  publish(content): Promise<PublicationResult>
  validate(content): ValidationResult
  getCapabilities(): ChannelCapabilities
}
```

Potential adapters:

```text
LinkedIn
Bluesky
Mastodon
Instagram
Reddit
Blog
Newsletter
```

Do NOT implement all of these initially.

V1:

```text
Bluesky
LinkedIn if API access is practical
Reddit draft generation only
```

The architecture must allow new channels to be plugged in without changing the core strategy engine.

---

# 13. Automation safety levels

Each channel should have an automation policy.

Use three levels:

## Automatic

Safe content can publish without human intervention.

## Approval Required

Content is generated automatically but requires user approval.

## Suggestions Only

The system identifies an opportunity and recommends an action but does not perform it.

Example:

```text
Bluesky        Automatic
LinkedIn       Automatic
Reddit         Approval Required
Hacker News    Approval Required
Discord        Suggestions Only
```

Store this configuration per account/channel.

---

# 14. Reddit/community strategy

Treat communities differently from normal social channels.

Do NOT automatically drop product links into relevant communities.

Create support for community intelligence:

```ts
CommunityProfile {
  name
  platform

  topics[]
  audienceSegments[]

  selfPromotionPolicy
  linkPolicy

  notes
  riskScore

  lastUpdatedAt
}
```

The system should be able to decide:

```text
POST
COMMENT
ANSWER WITHOUT LINK
SUGGEST HUMAN PARTICIPATION
NO_ACTION
```

`NO_ACTION` is an important valid decision.

---

# 15. Scheduler

Do NOT create architecture where:

```text
cron fires → mandatory post
```

Instead:

```text
Cron
 ↓
Planner evaluates state
 ↓
Should we act?
 ↓
If yes:
   choose best action
 ↓
generate
 ↓
validate
 ↓
publish or request approval
```

Sometimes:

```text
Decision = NO_POST
```

Use scheduled jobs as wake-up mechanisms for intelligent workflows.

---

# 16. UTM and attribution

Every outgoing campaign link should automatically receive tracking parameters.

Example:

```text
utm_source=linkedin
utm_medium=organic
utm_campaign=remote_isnt_global
utm_content=eligibility_post_04
```

Also generate an internal attribution ID.

Example:

```text
ref=gr_83fa92
```

Store:

```ts
TrackingLink {
  id
  productId
  campaignId?
  postId?

  destinationUrl
  generatedUrl

  source
  medium
  campaign
  content

  createdAt
}
```

---

# 17. Conversion tracking

The system should eventually understand:

```text
Impression
↓
Click
↓
Signup
↓
Activation
↓
Paid customer
```

MVP requires:

```text
click
signup
```

Design an event model:

```ts
GrowthEvent {
  id
  productId

  visitorId?
  userId?

  eventType

  campaignId?
  postId?
  trackingLinkId?

  metadata

  occurredAt
}
```

Avoid tying analytics directly to specific UI components.

---

# 18. Learning Engine

Performance history should influence future decisions.

Example:

```text
Salary transparency posts

Clicks: 2,400
Signups: 210
Conversion: 8.75%
```

versus:

```text
Generic career advice

Clicks: 3,100
Signups: 54
Conversion: 1.74%
```

The system should learn:

```text
Increase salary-related content.
Decrease generic career content.
```

Do NOT initially implement machine learning.

Start with:

- aggregated statistics;
- scoring;
- weighted averages;
- exploration vs exploitation;
- LLM interpretation of structured metrics.

Later more sophisticated models can be introduced.

---

# 19. Experiment Engine

Allow experiments across:

- hooks;
- CTAs;
- audience;
- platform;
- topic;
- post format;
- content angle;
- posting time.

Example:

```text
Experiment

Audience:
Brazilian senior backend engineers

A:
"Remote doesn't mean worldwide."

B:
"Most US remote jobs cannot hire you."

Metric:
signup conversion
```

Never optimize exclusively for likes.

Priority metrics:

1. paid customer;
2. activated user;
3. signup;
4. qualified visitor;
5. engagement;
6. impression.

---

# 20. Strategy reallocation

Eventually implement automatic resource allocation.

Example:

```text
Week 1

LinkedIn 25%
Reddit 25%
Bluesky 25%
Blog 25%
```

Results:

```text
Reddit produces 48% of signups.
LinkedIn produces 27%.
Blog produces 20%.
Bluesky produces 5%.
```

Future strategy:

```text
Reddit 40%
LinkedIn 25%
Blog 25%
Bluesky 10%
```

Think of growth channels as an investment portfolio.

Maintain some exploration budget instead of allocating 100% toward historical winners.

---

# 21. AI architecture

Do NOT build one giant agent with one giant prompt.

Separate responsibilities.

Potential AI services:

```text
Product Analyst
Audience Analyst
Growth Strategist
Content Planner
Content Writer
Channel Adapter
Risk Reviewer
Performance Analyst
Opportunity Analyst
```

These do NOT necessarily need to be independent autonomous agents.

Prefer ordinary deterministic application code wrapping focused LLM calls.

Example:

```text
Application logic
      +
Database state
      +
Platform rules
      +
Metrics
      +
Focused LLM call
      ↓
Structured decision
```

Require structured outputs whenever practical.

---

# 22. Model routing

Use cheaper models for routine jobs.

Example:

## Cheap model

- classification;
- tagging;
- extracting website content;
- basic rewriting;
- categorization;
- duplicate detection.

## Strong model

- growth strategy;
- audience reasoning;
- campaign planning;
- analyzing experiment results;
- risky community decisions.

Create an AI abstraction so models can change later.

```ts
AIProvider
```

Do not hard-code business logic directly against one model.

---

# 23. Memory

The AI must have persistent memory through the database.

Store:

- what was posted;
- where;
- when;
- content theme;
- content idea;
- audience;
- campaign;
- performance;
- previous experiments;
- decisions;
- rejected posts;
- user feedback.

Before generating content, retrieve relevant previous activity.

Avoid:

```text
same idea
same hook
same argument
same CTA
```

unless intentionally testing repetition.

---

# 24. Suggested initial stack

Prefer:

```text
Next.js
TypeScript
React

PostgreSQL / Neon

Drizzle or Prisma

Trigger.dev

LLM API

PostHog for product analytics

Sentry

Vercel
```

Keep services replaceable.

Avoid adding infrastructure unless it solves an actual current problem.

Do not introduce:

- Kafka;
- Kubernetes;
- microservices;
- vector databases;
- separate Python services;

unless clearly justified.

Start as a modular monolith.

---

# 25. Application modules

Suggested structure:

```text
/src

/modules

  products
  missions
  audiences
  campaigns
  content
  distribution
  attribution
  analytics
  experiments
  opportunities
  ai
  integrations
```

Each module should contain:

```text
domain logic
database access
services
schemas
types
```

Keep UI separate from business logic.

---

# 26. Main screens

## Dashboard

Show:

```text
Growth Mission progress

Users acquired
Qualified visitors
Conversion

Recent publications

Current experiments

Important learnings

Pending approvals
```

---

## Products

```text
Product
Status
Current mission
Users generated
Channels
```

---

## Product Profile

Show everything AI understands about the SaaS.

Allow editing.

---

## Audience

Show:

```text
Audience segments
Fit scores
Performance
Current investment
```

---

## Campaigns

Display:

```text
Campaign
Target audience
Theme
Status
Conversions
```

---

## Content

Kanban/calendar-like view:

```text
Ideas
Draft
Review
Scheduled
Published
Rejected
```

---

## Opportunities

Show:

```text
Opportunity
Audience fit
Potential value
Risk
Suggested action
```

---

## Analytics

Focus on:

```text
channel → visitor → signup → customer
```

rather than vanity metrics.

---

## Autopilot

This should eventually become the primary screen.

Example:

```text
ORBIT JOBS

MISSION
Get 1,000 qualified users

684 / 1,000

AUTOPILOT
● Active


THIS WEEK

14 publications
31,400 people reached
486 signups
39 customers


LEARNINGS

↑ Eligibility content performs +170%
↑ Brazil is highest-converting market
↓ Generic remote-work posts underperform


NEXT STRATEGY

Increase eligibility content
Test Argentina
Reduce generic advice
Create salary report
```

---

# 27. Development phases

## Phase 0 — Foundation

Build:

- repository;
- database;
- authentication;
- products;
- product profile;
- basic dashboard;
- AI abstraction;
- jobs/workflows.

Goal:

A SaaS URL can be registered and analyzed.

Do not proceed until this is stable.

---

## Phase 1 — Content engine

Build:

- audience segments;
- campaigns;
- content themes;
- content ideas;
- social post generation;
- content memory;
- approval workflow.

No automatic posting required yet.

Goal:

The system can create a coherent week of marketing content for one product.

---

## Phase 2 — Distribution

Build:

- channel abstraction;
- one real social integration;
- scheduling;
- automatic UTM generation;
- publication history;
- retry logic.

Goal:

One channel can run mostly autonomously.

---

## Phase 3 — Attribution

Build:

- redirect/tracking links;
- click events;
- signup attribution;
- campaign analytics;
- post analytics.

Goal:

Know which content actually generates users.

---

## Phase 4 — Learning

Build:

- channel performance;
- audience performance;
- content-angle performance;
- performance summaries;
- AI-generated learnings;
- recommended strategy changes.

Goal:

Future content differs because of previous performance.

---

## Phase 5 — Growth Missions

Introduce:

- mission goals;
- campaign planning;
- automated weekly strategy;
- content allocation;
- channel allocation.

Goal:

The system starts reasoning from business objectives rather than posting instructions.

---

## Phase 6 — Opportunity discovery

Build:

- audience discussions;
- community discovery;
- creator discovery;
- opportunity scoring;
- human approval.

Goal:

Find existing demand instead of only broadcasting content.

---

## Phase 7 — Audience growth

Add:

- audience quality analysis;
- qualified follower metrics;
- creator graph;
- community graph;
- audience affinity scoring;
- audience allocation.

Goal:

Grow the right audience rather than simply increasing followers.

---

## Phase 8 — Autonomous GrowthOS

Combine:

```text
Mission
↓
Audience discovery
↓
Strategy
↓
Content
↓
Distribution
↓
Conversions
↓
Experiments
↓
Learning
↓
Strategy adjustment
```

At this stage, begin evaluating whether the internal tool should become a commercial SaaS.

---

# 28. MVP definition

The MVP is COMPLETE when I can:

1. Add a SaaS URL.
2. Have AI generate a Product Profile.
3. Correct the Product Profile manually.
4. Define a target audience.
5. Define a Growth Mission.
6. Generate campaign ideas.
7. Generate multiple platform-specific content pieces.
8. Review the content.
9. Schedule content.
10. Publish through at least one platform integration.
11. Automatically attach attribution parameters.
12. See clicks and signups attributed to posts.
13. Prevent duplicate/repetitive content.
14. See basic AI-generated performance insights.

Nothing else is required for MVP.

---

# 29. Explicit non-goals for MVP

Do NOT build yet:

- automated Reddit engagement;
- follower automation;
- browser bots interacting with social networks;
- influencer outreach automation;
- autonomous comments;
- web-scale social monitoring;
- sophisticated ML recommendation systems;
- ad buying;
- video generation;
- Instagram integration;
- dozens of social networks;
- customer billing;
- multi-user teams;
- mobile apps.

Protect the scope aggressively.

---

# 30. Engineering principles

Whenever implementing a feature:

### Priority 1 — correctness

Avoid:

- duplicate publications;
- duplicated jobs;
- wrong attribution;
- accidentally publishing drafts;
- posting to the wrong product/account.

Use idempotency wherever external actions occur.

---

### Priority 2 — safety

External publishing must have:

```text
validation
rate-limit handling
retries
idempotency key
audit logs
automation policy
kill switch
```

Never retry a publication blindly if its outcome is unknown.

---

### Priority 3 — observability

Every workflow should expose:

```text
started
completed
failed
retried
cancelled
```

Log important AI decisions.

Store why important autonomous decisions were made.

---

### Priority 4 — cost control

Track:

```text
LLM tokens
web research
image generation
external API calls
workflow compute
```

per:

```text
product
campaign
mission
```

Eventually calculate:

```text
Growth infrastructure cost
÷
acquired customers
```

---

### Priority 5 — simplicity

Prefer:

```text
boring reliable architecture
```

over:

```text
clever distributed architecture
```

Do not create abstractions before they are needed.

---

# 31. AI development instructions

When working on this project:

1. Before implementing a large feature, inspect the existing architecture.

2. Explain:
   - what currently exists;
   - what needs to change;
   - the smallest reasonable implementation.

3. Do not implement future phases prematurely.

4. Avoid giant files.

5. Keep domain logic independent from React components.

6. Avoid unnecessary dependencies.

7. Validate all LLM structured responses.

8. Never trust LLM-generated IDs, URLs, permissions, platform capabilities, or database references without validation.

9. External operations must be idempotent.

10. Background jobs must handle retries safely.

11. Database migrations must preserve existing data.

12. Add useful tests around:
   - attribution;
   - scheduling;
   - campaign selection;
   - duplicate prevention;
   - publication state machines;
   - autonomous decision boundaries.

13. Prefer deterministic code where deterministic code is enough.

14. Use LLMs for judgment and language, not basic business logic.

15. Explain architectural tradeoffs when introducing infrastructure.

---

# 32. Implementation methodology

Do NOT attempt to generate the entire product at once.

Work iteratively.

For every phase:

```text
1. Inspect
2. Design
3. Implement
4. Test
5. Review
6. Simplify
7. Commit
```

At the beginning of each phase, produce:

```text
Current state

Objective

Required database changes

Required backend changes

Required UI changes

Background workflows

External integrations

Risks

Acceptance criteria
```

Then implement incrementally.

---

# 33. First task

Start ONLY with Phase 0.

Before writing code:

1. Propose the initial architecture.
2. Propose the database schema.
3. Propose the module structure.
4. Explain how Product Analysis will work.
5. Explain how asynchronous jobs will work.
6. Identify idempotency and failure concerns.
7. Define exactly what Phase 0 will and will not contain.

Do not implement anything until the Phase 0 architecture is coherent.

The immediate milestone is:

> I can paste a SaaS URL into GrowthOS, the application analyzes the website, creates a persistent editable Product Profile, and shows it in the dashboard.

Optimize the architecture for eventually supporting the complete GrowthOS vision while keeping the implementation appropriate for the current milestone.