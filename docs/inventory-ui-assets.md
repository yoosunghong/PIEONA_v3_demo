# ILLOVA inventory UI assets

The inventory uses original generated artwork rather than extracting interface pixels from the reference screenshot. The UI itself is implemented in React/CSS and uses real inventory quantities, acquisition timestamps and existing companion delivery actions.

- Final sprite sheet: `public/images/inventory-atlas-v2.png` (5 columns × 4 rows, transparent PNG).
- Generation: built-in `image_gen`, `transparent_background: true`; no API/CLI fallback.
- Reference role: user-supplied screenshot, visual style only.
- Mapping: `src/inventoryView.mjs`. The same atlas supplies item tiles, selected item artwork and the header chest. Unused shell/coral/seaweed/mineral cells are reserved artwork, not fabricated inventory entries.
- Layout: on desktop the right panel occupies 54.5% of the window (up to 1120px), with six inventory columns and a separate detail card. Mobile uses a bottom sheet.
- Selection: `src/facilityOutline.mjs` renders a white screen-space silhouette around the whole selected storage, garden bed or kitchen, including while walking toward it. Render targets are allocated only when selected and disposed with the scene.

## Final generation prompt

Generate a NEW production inventory icon SPRITE ATLAS. The supplied screenshot is a STYLE REFERENCE ONLY. Match the reference's charming soft pastel 3D TOY inventory icons very closely: very simple rounded chunky shapes, big cute tiny dot eyes, soft matte plastic/clay, NO realistic fish scales, NO realistic anatomy, NO intricate textures, NO photorealism. Fish are chubby little toys with smooth single-color bodies and oversized heads. Create ONE image with exactly 5 columns and 4 rows, equal square grid cells, isolated objects on genuine transparent background. No text, no labels, no frames, no UI, no numbers, no backdrop. Every object is centered in its own cell, occupies 65-70 percent of the cell and has generous clear padding so CSS can use each cell as one icon. Consistent orthographic 3/4 view. Row1: peach-orange cute pufferfish matching the screenshot pufferfish, silver-blue sardine toy, deep blue striped mackerel toy, turquoise horse-mackerel toy, salmon-pink sea bream toy. Row2: golden yellow sea bream toy, lavender stingray with tiny stars, bright green herb sprig, plump red tomato, blue flower with green stem. Row3: very simple grilled fish on a cream plate, simple grilled fish with herb garnish on cream plate, cute simplified seafood platter on cream plate, bright tomato salad in white bowl, pale pink scallop shell. Row4: pink branching coral, green seaweed, a single chunky grey stone, pale cyan crystal cluster, small light honey wooden treasure chest with wide cream gold bands and green sprout on top (match screenshot chest header closely). Main priority: precisely match the screenshot's adorable soft rounded 3D game icon style. Avoid realistic scales, gleaming chrome fish, multi-object decorations, checkerboards, floor planes, hard shadows. Maintain perfect five by four grid alignment and no cropped objects.

## Interaction details

The bottom "꺼내기" control asks the companion to bring one actual item using the existing `TAKE_FROM_STORAGE` action; delivery automatically returns it to shared storage as before. "넣기" returns an item currently being carried by stopping that companion task. The authenticated storage endpoint accepts only these two actions, validates stock and uses operation IDs to prevent duplicate requests. There is no new inventory capacity or invented personal bag.
