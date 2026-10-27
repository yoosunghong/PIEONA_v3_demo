# Reference farm artwork

The background uses a clean environment plate edited from the user-provided reference using the built-in `image_gen.imagegen` tool. The user requested a farm visually very close to that reference. This is a 2.5D composition: scenery is a static raster asset, while the nine plots, crops, growth, water/harvest controls, player avatar and navigation are live application state and controls. No screenshot UI or planted crops are baked into the background.

- Asset: `public/images/farm/farm-reference-environment-v2.png` (1669 × 942 raster, displayed on the 1670 × 942 reference coordinate system).
- Scene: `src/farmWorld.js` renders live crops, avatar, shadows and raycast targets with alpha over the background.
- UI: `src/GardenStudio.jsx` and `src/farm.css` use the reference's 1670 × 942 desktop coordinates and adapt on mobile.
- Crop and XP displays use actual persisted account state. Empty plots stay empty; the reference-sized populated QA image is produced using real farm actions in an isolated in-memory test account.
- Capture saves the background and live scene as a PNG, rather than capturing hidden village content.
- Verification: `npm run build`; `node scripts/verify-farm.mjs`. QA screenshots are under `artifacts/farm/` and `artifacts/farm/reference/`.

## Final generation prompt

```text
Use case: precise-object-edit. Edit target: the supplied 1670x942 farming game reference screenshot. Asset type: clean static environment background plate for an interactive browser game. Preserve the entire existing environment and exact camera/composition, EVERY tree, flower, fence, bridge, cliff, garden tools, wood gate, bench, potting stand and blue striped market stall, landscape, lake, soft miniature 3D clay materials, colors and lighting. Do NOT reimagine or redesign. Keep this 16:9 landscape framing and identical positions and scale of all scenery. Remove ALL UI overlays, text, panels, icons, water bubble, navigation buttons, level card, breadcrumb, chat button. Inpaint those regions with the continuation of the scenery behind them. Remove the white-haired player character standing near the middle lower garden. Remove ALL plants/crops from the nine central wooden raised garden beds and leave their warm brown bare soil visible. Keep all NINE raised beds in EXACTLY the original positions and geometry, no moving, no extra beds: the field centered roughly x=805,y=477 spans x=560..1045,y=335..624. Preserve nearby ground. There must be no UI, text, water bubble, character or planted crops anywhere. This is only the clean scene environment; live plants, character and all UI will be implemented separately. Highest fidelity to the reference environment.
```
