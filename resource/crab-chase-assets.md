# 게 게 게 assets

## Banner

- Tool: built-in ImageGen (2026-10-16).
- Project asset: `public/images/minigames/crab-chase-banner.webp` (1536 × 1024, WebP quality 90).
- Used by the minigame card, instructions and result screen.
- Final generation prompt:

> Use case: stylized-concept. Asset type: landscape 1536x1024 premium cozy 3D social game minigame card banner. Primary request: a funny tense chase on a sunlit tropical beach, a cute small adventurer with a straw hat and mint green beach clothes running away from a long winding single-file procession of bright coral-red crabs with expressive raised claws and eyestalks; more crabs patrolling in the distance. High elevated top-down three-quarter view, clear curled crab trail, turquoise sea and white foamy waves along the left edge, warm peach golden sand, tiny seashells, palm trees and striped beach parasols at edges. Polished charming claylike 3D game render, soft ambient occlusion and long warm shadows, vivid teal / coral / sand palette, playful summer atmosphere. Readable composition at small card size, main runner and crabs near center, no text, no letters, no logos, no watermark.

## Paradise artwork refresh (2026-10-17)

- Tool: built-in ImageGen. Project asset: `public/images/minigames/crab-paradise.webp` (1536 × 1024, WebP quality 86, about 260 KiB).
- Used by the game card, introduction and result card. Original banner preserved.
- Final generation prompt:

> Create a premium cozy 3D game illustration, landscape 1536x1024, for a cute Korean beach crab chase minigame. Rounded toy-like coral orange crabs with big friendly eyes and raised claws running in a winding procession on warm ivory sand, sparkling shallow turquoise ocean on the left, distant lush palm trees, tiny seashells, soft sunny lighting, pastel teal and peach palette, polished family game key art with detailed soft shadows. Composition: cluster of crabs across center and right, lower left mostly clean softly lit sand so interface text can overlay. No people, no typography, no letters, no logos, no UI, no borders. Charming, energetic, crisp, high quality stylized 3D render.

- Runtime additions: instanced sea sparkles, starfish clusters, expanding spawn rings. The 100-crab draw budget test remains within 65 meshes.
- Spawns: first patrol after 2.8 seconds of active play, exponential acceleration to a 700 ms minimum at about 58 seconds; 100-crab cap retained.
- Results: explicit victory, defeat, draw and solo game-over badges. Solo retry and multiplayer rematch actions remain in the card footer. Rematches require both saved results and the opponent's explicit acceptance, expire after 30 seconds, and support rejection/cancellation.

## Runtime asset implementation

- `src/crabWorld.js`: instanced crabs with animated legs, claws and eye stalks; sand texture; moving foam; palm trees; parasols; buoy ropes; shells; footprints.
- `src/crabAudio.mjs`: synthesized surf ambience and recruitment / collision cues through Web Audio.
- Player models and customization reuse the existing PIEONA avatar assets.

## Play and validation

- Solo: survive as long as possible, 1 base point per 0.1 second plus 2 bonus points per second per crab beyond the starting two. Bonuses accrue only while that chain length is held. Gold starts at 20 seconds and shares the existing daily reward limits.
- Duel: invite one neighbor in the same village. All patrols and both processions collide with both players. Last survivor wins; simultaneous contacts draw; leaving forfeits.
- Controls: physical WASD / arrow keys or the mobile analog joystick. Inputs expire on the server after 400 ms without refresh.
- Simulation: 30 Hz server authority; about 20 Hz snapshots; continuous frame-based local movement prediction, input acknowledgement replay and eased visual corrections. Camera half-size is 8.2 m (previously 14 m), with player tracking. No per-frame database writes. Static scenery and wave beads are instanced; stationary scenery shadows are cached and moving actors use contact shadows. The background village stops periodic rendering while a minigame is open.
- Checks: `npm test`, `npm run build`, desktop keyboard play and 390 × 844 mobile layout.

## Reference-matched graphics and bubble/life update (2026-10-17)

The three user-supplied images are visual references only. The UI uses live text, buttons and authoritative game state; no screenshot UI is embedded. Visual similarity is qualitative, and a measured 95% match is not asserted.

### Current runtime

- Five new PNG assets below were made with the built-in ImageGen tool. Original assets are preserved. All production files reside in `public/images/minigames/`.
- The playfield uses detailed baked beach artwork on a 64 × 60 m ground plane, animated instanced crab sprites with contact shadows, real 3D collectible bubbles, footprints, spawn rings and water sparkles. Procedural crab meshes remain the fallback. Existing customizable 3D player avatars are retained.
- Camera half-height is now 12 m, allowing more of the shoreline to appear. Desktop and mobile share a circular live minimap with an expansion control. Short result panels use compact layouts; result actions stay outside the scrolling content.
- Everyone starts with 3 lives. Contact costs 1 life and grants 1.5 seconds of invulnerability, shown by blinking and the heart HUD. The third hit ends survival. Same-tick final hits draw in duels.
- Bubbles trigger immediately on server-detected contact. Purple steals only the opponent's final crab and attaches it to the collector's tail. Orange removes one own tail crab and launches it at 17 m/s toward the opponent's current position; collision checks cover the whole traveled segment. A launched crab returns to chase mode after impact, beach boundary contact or 2.4 seconds. Mint makes both processions zigzag for 7 seconds; collecting another mint bubble refreshes this duration.
- Solo: steal recruits a patrol crab; launch fires in the current movement direction. An empty donor chain or no own crab consumes its bubble with a visible no-effect message. Receiving chains retain their 52-crab cap.
- Three bubbles start 5 m ahead; a new random bubble may appear every 7 seconds, expires after 22 seconds, and at most 5 exist. All spawning uses the deterministic simulation RNG. Countdown freezes them.
- Best score in the new HUD is stored per account in this browser. Server settlement, gold caps, village rankings and consensual duel rematches continue to use the existing services.

### Final asset prompts

**`crab-title-v2.png`** — source: user reference 1; edit, opaque.

> Use case: precise-object-edit. Production game background, widescreen 16:9. Edit target is the attached tropical crab game title screen. Remove ALL text, title, symbols, numbers, UI cards, buttons and icons on the left, and reconstruct just the turquoise ocean and shore behind them. Keep the exact glossy adorable 3D orange crabs, their procession on the right, large smiling crab in bottom right, sunlit tropical paradise, water, foliage framing, dock and mountains unchanged. Left 42% remains calm turquoise water with no subjects, reserved for live HTML typography. No letters, no UI, no watermark.

**`crab-over-v2.png`** — source: user reference 3; edit, transparent.

> Use case: background-extraction. Edit target: attached crab game over screen. Create a wide transparent game UI header decoration asset: extract only the large adorable glossy orange crab lying on its back, the little white pastel ghost above it, the two smaller crabs behind, and their tiny sand island with rocks, seafoam and shells. Preserve exact character design and quality. Remove ALL text, all panel/card rectangles, buttons, the entire blurred game backdrop. Transparent alpha background around the island silhouette. Composition centered, landscape 2:1, characters in top 80%, shallow sand/foam base in bottom 20%, no lettering, no interface. This image will sit above a cream HTML results panel.

**`crab-beach-v2.png`** — source: user reference 2; edit, opaque.

> Use case: precise-object-edit. Production game environment map texture. Edit target attached beach game screenshot, preserve its richly detailed sunlit stylized 3D tropical beach rendering, turquoise water, detailed golden granular sand, mossy gray boulders, starfish, lush palm fronds, wooden dock at bottom left and beach props on right. Remove absolutely ALL HUD, typography, UI, minimap, timer, cards, joystick, ALL crabs, ALL characters, rings, arrows and footprints. Reconstruct empty sand and scenery behind removed things. Transform to TRUE VERTICAL TOP DOWN ORTHOGRAPHIC view from directly above so usable as a flat ground texture in a real 3D game. Square 1:1 image: leftmost 18% turquoise sea with foamy shoreline, rightmost 15% lush boulders and palms, upper and lower 8% scattered rocks/foliage, central 65% almost entirely clear walkable golden sand with tiny shells, no large obstacles in center. High detail matching reference. No text, no UI, no creatures, no people, no watermark.

**`crab-win-v2.png`** — source: generated `crab-over-v2.png`; edit, transparent.

> Use case: precise-object-edit. Edit target is transparent crab island game-over decoration. Create matching VICTORY version, keep same adorable glossy orange crab character design, size, small sand island silhouette, seafoam, rocks, shells, landscape framing, transparent background. Main crab is upright and grinning joyfully with both claws triumphantly up, wearing a small shiny golden crown. Two little crabs celebrate behind it. Replace the sad ghost with a small golden trophy and a few sparkling gold stars. No text, no panel, no UI. Transparent alpha around all edges.

**`crab-sprite-v2.png`** — source: user reference 2; edit, transparent.

> Use case: background-extraction. Production game sprite asset. From the attached game reference, isolate ONE of the adorable glossy orange crabs into a large clean transparent cutout. Match its stylized 3D render exactly: shiny round orange shell, cream belly, two big cute round expressive eyes, two large raised orange pincers, six little orange legs. Camera is high top-down at 65 degrees elevation as in the reference gameplay. Crab faces straight TOWARD THE TOP of the image, away from bottom, with the eyes and pincers at the TOP; not front-facing portrait, not side facing. All limbs clearly readable. Symmetric idle walking pose. Fill square image 85% subject, no ground, no shadows, no sand, no text, no UI, no other crabs. Actual transparent alpha background. Detailed polished soft orange toy-like surface, same cute character style as reference.


### Verification for this revision

- Full suite: 146 tests passed. Includes exact-tail ownership transfer, no-effect edge cases, close-range and swept projectile hits, 7-second zigzag expiry, three lives with invulnerability, deterministic spawning, socket snapshots, result settlement, duel draws and rematches.
- Production build: `npm run build`.
- Browser: WASD movement, automatic bubble pickup, life HUD, solo retry/home, real socket duel victory, minimap expansion, game-method help, 1440 × 1000 desktop and 390 × 844 mobile. No browser console errors observed. Evidence screenshots are under `test-results/crab-*-v2.png` (ignored local outputs).
- Running Node servers must be restarted to load the shared simulation change. Refresh clients together after the restart.
