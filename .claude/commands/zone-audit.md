# Zone Architecture Audit

Audit machine positions against the MillOS zone layout:

```
Zone 1 (z=-22): Silos Alpha-Epsilon     [Raw Material Storage]
Zone 2 (z=-6):  Roller Mills RM-101-106 [Milling Floor]
Zone 3 (z=6, y=9): Plansifters A-C      [Sifting - Elevated]
Zone 4 (z=20):  Packers Lines 1-3       [Packaging Output]
```

Search `src/components/MillScene.tsx` and related files for:
1. All `position={[x, y, z]}` props
2. Machine component placements
3. Any hardcoded coordinates

Report:
- Machines in correct zones
- Any machines outside expected zone boundaries
- Recommendations for corrections

This keeps the factory layout logically organized.
