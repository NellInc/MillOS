# Continuation Prompt: MillOS Asset Shopping List

## Objective

Source stylized low-poly 3D assets to replace procedural geometry in MillOS, achieving a "Bruno Simon" aesthetic - warm, polished, cohesive.

**Target Style:** Low-poly stylized, NOT realistic. Think Synty Studios POLYGON series, Kenney assets, or Kay Lousberg's work.

**Technical Requirements:**
- Format: GLB/GLTF (preferred) or FBX
- Poly count: Low-poly (under 5k tris per hero asset, under 1k for props)
- Materials: PBR compatible (albedo, normal, roughness/metalness)
- Scale: Metric units (1 unit = 1 meter) or easily rescalable
- License: Commercial use permitted

---

## Priority 1: Hero Machines (CRITICAL)

These are the main visual focus of the application. Replace procedural boxes with proper models.

### 1.1 Grain Silos (5 needed)

**Current:** Procedural cylinders with cone tops
**Needed:** Industrial grain storage silos

**Search terms:**
- "low poly silo"
- "industrial storage tank stylized"
- "farm silo 3D model"
- "grain bin game asset"

**Specifications:**
- Tall cylindrical silos with conical/domed tops
- Should have: access ladder, inspection hatch, level indicator, discharge chute
- Height: ~10-15m in-world (model should be ~10-15 units tall)
- Ideally a pack with variations (different heights, wear levels)

**Sources to check:**
| Source | Search Link | Notes |
|--------|-------------|-------|
| Sketchfab | [silo lowpoly](https://sketchfab.com/search?q=silo+low+poly&type=models) | Filter by downloadable, price |
| Synty Store | Check POLYGON Farm or Industrial | Often bundled |
| CGTrader | [grain silo](https://www.cgtrader.com/3d-models/low-poly?keywords=grain+silo) | Quality varies |
| Quaternius | [Free packs](https://quaternius.com/) | Check farm/industrial |
| Kenney | [Assets](https://kenney.nl/assets) | May have in packs |

**Budget guidance:** $15-40 for a quality pack with variations

---

### 1.2 Roller Mills (6 needed)

**Current:** Procedural boxes with cylinders for rollers
**Needed:** Industrial milling machines

**Search terms:**
- "industrial machine low poly"
- "factory machinery stylized"
- "milling machine game asset"
- "industrial equipment 3D"

**Specifications:**
- Boxy industrial machine with visible rollers/cylinders
- Control panel on front face
- Motor/drive unit visible
- Hoppers (input/output)
- Size: ~3.5m wide x 5m tall x 3.5m deep

**Alternative approach:** If specific "roller mill" unavailable, look for:
- Generic industrial machinery
- Crusher/grinder machines
- Factory processing equipment

**Sources to check:**
| Source | Search Link | Notes |
|--------|-------------|-------|
| Synty Store | POLYGON Factory/Industrial | Best bet for cohesive style |
| Sketchfab | [factory machine](https://sketchfab.com/search?q=factory+machine+low+poly&type=models) | May need to combine parts |
| TurboSquid | [industrial lowpoly](https://www.turbosquid.com/Search/3D-Models?keyword=industrial+low+poly) | Higher prices |

**Budget guidance:** $20-50 for industrial machine pack

---

### 1.3 Plansifters (3 needed)

**Current:** Procedural boxes with stacked layers
**Needed:** Industrial sifting/screening equipment

**Search terms:**
- "industrial sifter 3D"
- "screening machine low poly"
- "vibratory separator model"
- "factory sorting machine"

**Specifications:**
- Multi-level screening machine
- Visible mesh/grate layers
- Suspended/mounted on frame (these shake in operation)
- Size: ~4m x 6m x 3m

**Note:** This is specialized equipment. May need to:
- Adapt a generic industrial machine
- Commission custom work
- Accept a less accurate representation

---

### 1.4 Packing Machines (3 needed)

**Current:** Procedural boxes with conveyor elements
**Needed:** Industrial packaging/bagging line

**Search terms:**
- "packing machine 3D"
- "bagging machine low poly"
- "industrial packaging line"
- "factory packer game asset"

**Specifications:**
- Conveyor-fed packaging station
- Hopper/funnel input
- Bag/container output area
- Control panel
- Size: ~3m x 3m x 2m

**Sources to check:**
| Source | Search Link | Notes |
|--------|-------------|-------|
| Synty POLYGON | Factory/Warehouse packs | May have conveyor/packing assets |
| Kay Lousberg | [Packs](https://kaylousberg.itch.io/) | Industrial themes |

---

## Priority 2: Vehicles

### 2.1 Forklift (Multiple instances)

**Current:** Has GLB model (`public/models/forklift/forklift.glb`) - evaluate if upgrade needed
**Needed:** Stylized industrial forklift

**Search terms:**
- "forklift low poly"
- "warehouse forklift stylized"
- "industrial vehicle game asset"

**Specifications:**
- Classic counterbalance forklift
- Working mast (can be static)
- Driver seat visible
- Size: ~3m long x 2m tall

**Check existing first:** Review current model quality before purchasing replacement.

---

### 2.2 Trucks (Dock area)

**Current:** May be procedural or minimal
**Needed:** Delivery/grain trucks for dock area

**Search terms:**
- "delivery truck low poly"
- "cargo truck stylized"
- "semi truck game asset"
- "grain truck 3D"

**Specifications:**
- Box truck or semi with trailer
- Stylized but recognizable
- Size: ~8-12m long

**Sources:**
| Source | Search Link | Notes |
|--------|-------------|-------|
| Kenney | [Vehicle packs](https://kenney.nl/assets?q=vehicle) | FREE, excellent quality |
| Synty | POLYGON City/Vehicle packs | Premium, cohesive |
| Quaternius | Vehicle packs | FREE |

**Budget guidance:** $0-25 (many free options available)

---

## Priority 3: Workers/Characters

### 3.1 Factory Workers (12+ needed)

**Current:** Has GLB model (`public/models/worker/worker.glb`) - likely needs upgrade
**Needed:** Stylized low-poly workers with role variations

**Search terms:**
- "low poly worker character"
- "factory worker 3D stylized"
- "industrial character pack"
- "construction worker game asset"

**Specifications:**
- Low-poly humanoid characters
- Variations needed:
  - Operators (hard hats, coveralls)
  - Engineers (clipboard, safety vest)
  - Supervisors (different colored vest/hat)
  - Safety officers (high-vis, safety equipment)
  - Maintenance (tool belt, wrench)
- Rigged for basic animations (idle, walk) is a plus but not required
- Gender/diversity variations appreciated

**Sources:**
| Source | Search Link | Notes |
|--------|-------------|-------|
| Synty | POLYGON People/Worker packs | Best variety, cohesive |
| Quaternius | Character packs | FREE, good quality |
| Mixamo | Characters + animations | FREE with Adobe account |
| Kay Lousberg | Character packs | Stylized, affordable |

**Budget guidance:** $15-40 for character pack with variations

---

## Priority 4: Environment Props

### 4.1 Industrial Props Pack

**Needed:** Scatter props for visual interest

**Items to include:**
- Pallets (wooden, plastic)
- Barrels/drums
- Crates/boxes
- Tool carts
- Fire extinguishers
- Safety signage
- Ladders
- Pipes/ducts
- Electrical panels
- Fencing/barriers
- Grain sacks/bags
- Cleaning equipment (brooms, mops)

**Search terms:**
- "industrial props low poly"
- "warehouse props pack"
- "factory environment assets"

**Sources:**
| Source | Search Link | Notes |
|--------|-------------|-------|
| Kenney | [Props packs](https://kenney.nl/assets) | FREE, many options |
| Synty | POLYGON packs include props | Bundled with environment packs |
| Quaternius | Props collections | FREE |

**Budget guidance:** $0-20 (many free options)

---

### 4.2 Conveyor System Parts

**Current:** Procedural belts and rollers
**Needed:** Modular conveyor segments

**Items to include:**
- Straight belt sections (various lengths)
- Curved sections
- Roller conveyors
- Support legs/frames
- Guard rails

**Search terms:**
- "conveyor belt 3D low poly"
- "factory conveyor modular"
- "industrial belt system"

**Budget guidance:** $10-30 or included in industrial packs

---

## Priority 5: Environment/Structure

### 5.1 Factory Building Elements

**If not using procedural walls/floors:**
- Industrial wall panels
- Windows (industrial style, perhaps dirty/frosted)
- Overhead lights/fixtures
- Support columns/beams
- Doors (personnel, roll-up dock doors)
- Ventilation ducts
- Ceiling/roof structure

**Search terms:**
- "industrial building interior"
- "factory environment kit"
- "warehouse modular assets"

---

## Recommended Complete Packs

### Option A: Synty Studios Bundle (Premium, Cohesive)

| Pack | Price | Contents |
|------|-------|----------|
| POLYGON Factory | ~$30 | Machines, conveyors, props |
| POLYGON Farm | ~$25 | Silos, grain storage, tractors |
| POLYGON City Characters | ~$25 | Worker variations |
| **Total** | **~$80** | Complete cohesive set |

**Pros:** Professional quality, guaranteed style consistency, includes animations
**Cons:** Higher cost, may need to adapt some assets

---

### Option B: Free/Low-Cost Mix (Budget)

| Source | Contents | Cost |
|--------|----------|------|
| Kenney | Vehicles, some props | FREE |
| Quaternius | Characters, environment | FREE |
| Kay Lousberg | Industrial pack | $5-15 |
| Sketchfab singles | Specific machines | $5-20 each |
| **Total** | **$20-50** | Mix and match |

**Pros:** Budget-friendly, flexible
**Cons:** Style consistency requires careful curation

---

### Option C: Commission Custom (Maximum Quality)

For truly unique, perfectly-fitting assets:

| Platform | Artist Rate | Notes |
|----------|-------------|-------|
| Fiverr | $50-200/model | Variable quality |
| Upwork | $100-500/model | Professional |
| ArtStation | $200-1000/model | High-end |

**When to commission:**
- Specific grain milling equipment not available
- Need exact brand/style match
- Budget allows for premium work

---

## Technical Integration Notes

### File Preparation

Before importing assets:

1. **Scale check:** Ensure model scale matches MillOS (1 unit = 1 meter)
2. **Origin point:** Center origin at base of object for easy placement
3. **Material names:** Standardize material names for shader swapping
4. **LOD consideration:** If high-poly, create decimated LOD versions

### Import to MillOS

Assets should be placed in:
```
public/models/
├── machines/
│   ├── silo.glb (existing)
│   ├── roller-mill.glb
│   ├── plansifter.glb
│   └── packer.glb
├── vehicles/
│   ├── forklift.glb (existing)
│   └── truck.glb
├── characters/
│   └── worker.glb (existing - upgrade)
└── props/
    ├── pallet.glb
    ├── barrel.glb
    └── ... etc
```

### Code Integration

Existing model loading infrastructure in `src/utils/modelLoader.ts`:

```typescript
export const MODEL_PATHS = {
  silo: '/models/machines/silo.glb',
  forklift: '/models/forklift/forklift.glb',
  worker: '/models/worker/worker.glb',
  // Add new models here:
  rollerMill: '/models/machines/roller-mill.glb',
  plansifter: '/models/machines/plansifter.glb',
  packer: '/models/machines/packer.glb',
  truck: '/models/vehicles/truck.glb',
};
```

---

## Shopping Summary Checklist

### Must Have (Priority 1-2)
- [ ] Grain silos (5 variations ideal)
- [ ] Industrial machines (roller mills, or adaptable)
- [ ] Packing/bagging equipment
- [ ] Forklift (evaluate existing)
- [ ] Trucks for dock area

### Should Have (Priority 3-4)
- [ ] Worker characters with variations
- [ ] Industrial props pack (pallets, barrels, etc.)
- [ ] Conveyor system modular pieces

### Nice to Have (Priority 5)
- [ ] Building interior elements
- [ ] Additional prop variations
- [ ] Animated versions of characters

---

## Budget Recommendations

| Budget Tier | Approach | Estimated Cost |
|-------------|----------|----------------|
| Minimal | Free assets only (Kenney, Quaternius) | $0 |
| Moderate | Mix of free + key purchases | $50-100 |
| Quality | Synty packs + fill gaps | $100-200 |
| Premium | Synty + custom commissions | $300-500 |

**Recommended:** Moderate-to-Quality tier ($100-200) provides best balance of cohesive style and coverage.

---

## Links Quick Reference

| Source | URL | Type |
|--------|-----|------|
| Synty Store | https://syntystore.com/ | Premium packs |
| Kenney | https://kenney.nl/assets | Free packs |
| Quaternius | https://quaternius.com/ | Free packs |
| Kay Lousberg | https://kaylousberg.itch.io/ | Affordable packs |
| Sketchfab | https://sketchfab.com/ | Individual models |
| CGTrader | https://www.cgtrader.com/ | Individual models |
| TurboSquid | https://www.turbosquid.com/ | Individual models |
| Mixamo | https://www.mixamo.com/ | Characters + animations |

---

## Style Consistency Checklist

When evaluating assets, check:

- [ ] Poly count similar to other assets (~1k-5k tris)
- [ ] Art style matches (same level of stylization)
- [ ] Color palette compatible (warm industrial tones)
- [ ] Material setup is PBR
- [ ] Scale is consistent
- [ ] Edge treatment similar (hard edges vs smooth)
- [ ] Level of detail matches (same amount of small details)

**Warning signs of style mismatch:**
- Photorealistic textures on low-poly mesh
- Drastically different poly density
- Incompatible art direction (cartoon vs semi-realistic)
- Wrong era/setting (modern vs vintage)
