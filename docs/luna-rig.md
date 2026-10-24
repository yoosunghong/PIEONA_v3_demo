# Luna Frostwing companion

Historical asset: the live baby dragon now uses the [Crystalwing flight mount](crystalwing-mount.md). These Luna files are retained as source history.

The babyDragon variant uses the supplied Meshy Luna Frostwing FBX and its original four PBR texture maps. The model has 15,669 triangles, 11,323 seam-split runtime vertices, and a new 16-bone armature (body, head, two tail segments, two wing segments per side, and upper/paw segments for all four legs). Each vertex has up to four normalized spatial skin weights.

- Editable rig, with textures packed: `resource/luna/luna-rigged.blend`
- Portable skinned model: `public/models/luna/luna-rigged.glb`
- Synchronous runtime geometry and weights: `src/lunaSkin.json`
- Runtime posing: `src/lunaDragon.mjs`

Rebuild using Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/rig-luna.py -- '<folder containing the source FBX and textures>'
```

The web geometry uses the same vertex weights as the Blender armature. Runtime bone posing supplies walking, idle head/wing/tail motion, sitting, and affection. The GLB contains the rest pose and skin; animations are procedural in the web runtime. Existing pet colors tint the original texture. Reward images are regenerated with `scripts/render-survey-rewards.mjs` against a local Vite server.

Validation: imported mesh deformation, weight normalization, independent skeletons, reduced-motion rest pose, pet dimensions, and survey reward integration tests.
