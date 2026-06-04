# 12-Lane File/Area Inventory (parallel-audit scope)

_Universe: 97 UI-DOM, 150 scene/3D, 102 logic, 46 integration, 16 config files._
Within each lane, agents own non-overlapping file slices (overlap ACROSS lanes is expected — same file, different concern).

- **L1** correctness/bugs — 14 agents, 298 files. scene/3D render+logic
- **L2** security & authz (PDP/auth/middleware) — 7 agents, 57 files. 
- **L3** data & privacy / GDPR — 3 agents, 18 files. 
- **L4** API contracts & error handling — 6 agents, 49 files. 
- **L5** accessibility WCAG 2.1 AA — 11 agents, 97 files. every DOM/HTML UI surface
- **L6** UX flows & navigation — 8 agents, 97 files. onboarding, panel nav, keyboard, mobile, empty/error/loading states
- **L7** copy & microcopy — 8 agents, 98 files. labels, tooltips, errors, announcements, terminology
- **L8** visual/layout/design coherence — 11 agents, 97 files. typography scale, spacing, color tokens, responsive, dark theme, alignment
- **L9** performance — 10 agents, 253 files. useFrame allocations, shader keys, re-renders
- **L10** legal text (ToS/privacy/cookies) — 2 agents, 5 files. review drafts for accuracy+completeness vs the app
- **L11** dead code & tech debt — 10 agents, 395 files. unused exports/components/props, orphans
- **L12** launch-blocking config (env/secrets/deploy) — 6 agents, 16 files. env, secrets, deploy workflows, CSP, SW, SEO, build inputs
