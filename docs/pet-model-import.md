# Pet models

The pet factories use the supplied Meshy meshes, armatures and PBR textures.

| Type | Source in Downloads | Rig | Motion |
| --- | --- | --- | --- |
| Dog | `Meshy_AI_Blossom_Pup_quadruped` | Original 27 bones | Supplied walking action |
| Cat | `Meshy_AI_Blossom_Kitty_quadruped` | Original 27 bones | Supplied walking action |
| Baby dragon | `Meshy_AI_Character_output.glb` | Original 47 bones | Flight action applied to existing wing, tail and head bones |

Portable GLBs and extracted textures are in `public/models/pets/`. The generated
`src/petModels/*.json` templates retain geometry, skin weights, bind matrices,
bone hierarchy and animation tracks, allowing existing synchronous scene
factories to create each model without an empty loading placeholder. Instances
have separate skeletons and animation mixers. Textures load in the browser.

Rebuild from the original sources:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/import-pet-models.py -- 'C:\Users\Foryoucom\Downloads'
node scripts/prepare-pet-models.mjs
```

The importer preserves the existing rigs, removes the non-character Icosphere
helper, and exports the strongest four normalized skin influences supported by
the web renderer. Runtime normalization grounds the initial animated pose and
keeps source proportions. The dragon saddle is adjusted to the new body.

Rabbit is no longer selectable or accepted by appearance APIs. Saved rabbit
appearances resolve to the default dog while retaining their valid coat color.

Validation: run the pet, dragon mount and survey reward tests. The optional
`scripts/verify-pet-models.mjs` browser check requires Playwright (set
`PLAYWRIGHT_MODULE` if installed outside this repository) and Chrome; it writes
three animation frames per model to `tmp/pet-model-qa/`.
