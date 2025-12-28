# 3D Model Assets

This directory contains 3D models for the MillOS grain mill simulator.
The app will automatically detect and use GLTF/GLB models if present, otherwise falling back to improved procedural primitives.

## Directory Structure

```
models/
├── forklift/
│   └── forklift.glb    # Forklift vehicle model
├── worker/
│   └── worker.glb      # Animated worker character
└── machines/
    ├── silo.glb        # Grain silo
    ├── roller-mill.glb # Roller mill machine
    ├── plansifter.glb  # Plansifter machine
    └── packer.glb      # Packing machine
```

## Recommended Free Model Sources (CC0/Free License)

### Forklift Models

1. **Sketchfab** - Animated forklift with fork/wheel bones
   - https://sketchfab.com/3d-models/forklift-d40cae50e04145dd997cdca415cd72ad
   - Download as GLTF, rename to `forklift.glb`

2. **Quaternius** - Low poly vehicle packs
   - https://quaternius.com/
   - Check vehicle/industrial packs

### Character/Worker Models

1. **Quaternius** - Animated characters (CC0)
   - https://quaternius.com/
   - Has walk/idle/run animations
   - Download animated character pack

2. **KayKit** - Character Pack Adventurers (CC0)
   - https://kaylousberg.itch.io/
   - Rigged and animated characters

3. **Kenney Blocky Characters** (CC0)
   - https://kenney.nl/assets/blocky-characters
   - Simple blocky style

4. **Mixamo** (Free with Adobe account)
   - https://www.mixamo.com/
   - High quality rigged characters
   - Many animation options

### Industrial/Machine Models

1. **Kenney City Kit Industrial** (CC0)
   - https://kenney.nl/assets/city-kit-industrial
   - Factory buildings, industrial props

2. **Poly.pizza** (CC0/Free)
   - https://poly.pizza/search/Industrial
   - Search for: factory, silo, machine, industrial

3. **Quaternius** - Various packs (CC0)
   - https://quaternius.com/
   - Space kit has sci-fi machinery that could work

## How to Add Models

1. Download the model from one of the sources above
2. Export/convert to GLB format if needed (Blender can do this)
3. Place in the appropriate subdirectory
4. Restart the dev server

The app will automatically detect and use the models.

## Model Requirements

- **Format**: GLTF 2.0 (.glb preferred, .gltf also works)
- **Scale**: Models should be appropriately scaled (forklift ~2.5m long, worker ~1.8m tall)
- **Origin**: Place origin at bottom center of model
- **Animations**: Named animations work best (Idle, Walk, Run for characters)

## Blender Export Settings

If converting models in Blender:

1. File > Export > glTF 2.0 (.glb/.gltf)
2. Format: glTF Binary (.glb)
3. Include: Selected Objects, Custom Properties
4. Transform: +Y Up
5. Mesh: Apply Modifiers, UVs, Normals, Tangents
6. Animation: Include if character model

## License Notes

All recommended sources are CC0 (public domain) or free for commercial use.
Always verify the license before using in production.

- **CC0**: No restrictions, use freely
- **CC-BY**: Attribution required
- **CC-BY-NC**: Non-commercial only
