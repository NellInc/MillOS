# Machine Textures

PBR texture maps for MillOS machine components.
These textures are only loaded on **high** and **ultra** quality settings.

## Source

All textures sourced from [ambientCG.com](https://ambientcg.com) (CC0 Public Domain).

## Directory Structure

```
textures/machines/
  256/   - 256x256 textures (high quality) - ~520 KB total
  512/   - 512x512 textures (ultra quality) - ~1.7 MB total
  1024/  - 1024x1024 textures (available) - ~19 MB total
```

## Available Textures

| Model | Files | Source Asset |
|-------|-------|--------------|
| Silos | silo_roughness, silo_normal, silo_ao | Metal038 (scratched steel) |
| Roller Mills | roller_mill_roughness, roller_mill_normal, roller_mill_ao | Metal046B (dark dirty metal) |
| Packers | packer_roughness, packer_normal, packer_ao | PaintedMetal006 (painted metal) |
| Plansifters | plansifter_roughness, plansifter_normal, plansifter_ao | Metal053C (rusted iron) |
| Floor | floor_roughness, floor_normal, floor_ao | Concrete034 |
| Workers | worker_roughness, worker_normal, worker_color | Fabric004 |
| Conveyors | conveyor_roughness, conveyor_normal, conveyor_color | Rubber004 |
| Pallets | pallet_roughness, pallet_normal, pallet_color | Wood051 |

## Usage

```typescript
import { useModelTextures } from '../utils/machineTextures';

// In a component
const textures = useModelTextures('silo');
// Returns { roughness, normal, ao } - null if disabled or not found

// Apply to material
if (textures.roughness) {
  material.roughnessMap = textures.roughness;
}
```

## Quality-Based Resolution

| Quality | Resolution | Memory |
|---------|------------|--------|
| Low | Disabled | 0 |
| Medium | Disabled | 0 |
| High | 256x256 | ~3 MB GPU |
| Ultra | 512x512 | ~13 MB GPU |

## Performance Impact

- Download: ~500 KB (256) to ~1.7 MB (512) one-time
- GPU Memory: ~3-13 MB depending on quality
- Render overhead: ~0.3-0.5ms per frame (negligible)
