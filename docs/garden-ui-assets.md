# Garden panel artwork

`public/images/garden-header.png` was generated with the built-in ImageGen tool, using the user-supplied garden screenshot as a style reference. The illustration has an alpha background and decorates the upper-right of the panel. Existing crop artwork is reused from `inventory-atlas-v2.png` through `InventoryIcon`. Layout, sprout emblem, soil and progress bars are CSS/SVG UI elements.

Generation prompt:

Create a NEW standalone transparent PNG header illustration for a cozy gardening-game panel. The supplied screenshot is a STYLE REFERENCE ONLY, use only the upper-right decorative garden vignette as inspiration, do not reproduce its UI, text, character or game world. Subject: an adorable tiny round white radish mascot with green sprout on its head, dot eyes and rosy cheeks, peeking out of a rich brown garden soil bed. Behind it a short honey-colored wooden picket fence. Fresh green herb leaves, small tomato seedlings and a few pale yellow daisies grow around the fence and mascot. Soft matte rounded 3D clay toy style, gentle sage green and warm cream palette, cheerful, premium game UI illustration, soft upper-left light, three-quarter orthographic view. Wide horizontal composition about 2:1; mascot centered slightly to the right. All objects fully contained with transparent padding. Genuine alpha background, no sky, no floor, no lettering, no labels, no borders, no screenshot elements. This asset will decorate the top-right of a pale green garden panel.

## Gameplay mapping

The reference composition is adapted to the actual game: HERB, TOMATO and FLOWER seeds are free; all three plots are available. Growth takes 5, 10 and 20 minutes, respectively, and each harvest yields one item. The panel uses server timestamps for countdown and readiness. It does not imply seed ownership, watering or paid expansion mechanics that the game does not support. Future seed cards are marked as being prepared. Selecting a plot also updates the world selection and white outline.

## Verification

- Production build passed; full test suite passed (286 tests).
- Browser QA at 1821×864 and 390×844 verified layout, seed selection, empty categories, plot selection, white outline and mobile scrolling without document overflow.
- In an isolated in-memory test village, planting FLOWER started its real 20-minute countdown; harvesting TOMATO cleared its plot and increased stored tomatoes from 3 to 4.
