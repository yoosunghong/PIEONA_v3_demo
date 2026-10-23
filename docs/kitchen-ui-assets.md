# ILLOVA kitchen UI

The kitchen follows the supplied reference: a warm cream panel with a chef-hat header, original cooking vignette, category navigation, a four-column recipe grid, ingredient detail and a brown cooking button. On mobile it becomes a bottom sheet with horizontal categories and a two-column recipe grid. Existing white facility outlines remain active.

The four supported recipes use actual inventory quantities. Future recipe slots are explicitly locked placeholders. Category counts and search results reflect supported recipes; salt or unsupported ingredients are not invented. Fish selection defaults to common/uncommon stock and rare fish require explicit selection.

The quantity stepper supports up to 99 servings, bounded by available ingredients. The server scales inputs, outputs and cooking time together (2 seconds per serving, plus travel), checks stock again at completion and preserves existing cancellation and request deduplication behavior. Natural-language recipe handling remains unchanged.

## Assets and generation

- `public/images/kitchen-header.png`: new transparent PNG generated with the built-in `image_gen` tool, using the user screenshot as a style reference only.
- `public/images/kitchen-dishes.png`: new four-dish transparent sprite sheet, generated with the built-in `image_gen` tool for full, uncropped plate illustrations.
- `public/images/inventory-atlas-v2.png`: reuses the existing generated ingredient sprites.
- Chef hat and controls: existing Lucide icon system rendered in code.
- No CLI/API fallback or screenshot pixel extraction was used.

Final generation prompt:

Use case: stylized-concept. Create a NEW standalone transparent PNG header illustration for a cozy cooking game UI. Supplied screenshot is STYLE REFERENCE ONLY: match the decorative cooking vignette in its upper right header, do not reproduce the UI, text, character on motorcycle, or world. Subject: a charming tiny round white radish mascot with green sprout leaves, little dot eyes and rosy cheeks, peeking over a deep navy-blue cooking pot filled with warm golden soup. A wooden spoon tilted up, leafy greens, tomatoes, carrots, onions, pale turnip, and a wooden cutting board clustered around the pot. Soft matte rounded 3D clay toy style, warm cream and terracotta accents, adorable and premium, consistent with the reference. Wide composition about 2:1, all objects fully contained with clear transparent padding, orthographic three-quarter view, soft upper-left light, no ground plane or drop shadow beyond the illustration, no borders, no lettering, no background. Actual alpha transparency. This will sit on the upper right of a cream recipe panel.


Dish sprite sheet generation prompt:

Create a production sprite sheet of four cozy cooking-game dishes on TRUE TRANSPARENT background. Use the screenshot ONLY as a style reference for the illustrated recipe plates. 2 columns x 2 rows, four precisely equal SQUARE cells. Each dish COMPLETELY contained and centered inside its cell, occupies at most 60 percent of cell width and 45 percent of cell height. VERY GENEROUS empty transparent margins are mandatory: no object may touch a cell boundary. No text, UI, numbers or frames. Soft matte pastel 3D clay toy illustration, appetizing and cute, no photorealism. Upper-left light, consistent three-quarter view, full plates entirely visible. Top left: one golden grilled fish on cream plate, lemon wedge and tiny parsley garnish. Top right: grilled fish with green herb sauce on cream plate. Bottom left: colorful seafood platter, shrimp, mussels and three pieces of fish on a cream plate. Bottom right: fresh red tomato salad with green leaves in a cream bowl. Match the screenshot's warm painterly 3D game food style. NO excessive realistic detail, no ground, no background. Each dish should be a wide oval serving in the CENTER of its square, with lots of clear space around it so it can be used at small and large sizes without cropping.

The generated sheet is 1536×1024 pixels; its four cells use a 3:2 aspect ratio in CSS to preserve the final artwork proportions.
