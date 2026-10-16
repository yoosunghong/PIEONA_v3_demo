# 게 게 게 assets

## Banner

- Tool: built-in ImageGen (2026-10-16).
- Project asset: `public/images/minigames/crab-chase-banner.webp` (1536 × 1024, WebP quality 90).
- Used by the minigame card, instructions and result screen.
- Final generation prompt:

> Use case: stylized-concept. Asset type: landscape 1536x1024 premium cozy 3D social game minigame card banner. Primary request: a funny tense chase on a sunlit tropical beach, a cute small adventurer with a straw hat and mint green beach clothes running away from a long winding single-file procession of bright coral-red crabs with expressive raised claws and eyestalks; more crabs patrolling in the distance. High elevated top-down three-quarter view, clear curled crab trail, turquoise sea and white foamy waves along the left edge, warm peach golden sand, tiny seashells, palm trees and striped beach parasols at edges. Polished charming claylike 3D game render, soft ambient occlusion and long warm shadows, vivid teal / coral / sand palette, playful summer atmosphere. Readable composition at small card size, main runner and crabs near center, no text, no letters, no logos, no watermark.

## Original runtime assets

- `src/crabWorld.js`: instanced crabs with animated legs, claws and eye stalks; sand texture; moving foam; palm trees; parasols; buoy ropes; shells; footprints.
- `src/crabAudio.mjs`: synthesized surf ambience and recruitment / collision cues through Web Audio.
- Player models and customization reuse the existing PIEONA avatar assets.

## Play and validation

- Solo: survive as long as possible, 1 base point per 0.1 second plus 2 bonus points per second per crab beyond the starting two. Bonuses accrue only while that chain length is held. Gold starts at 20 seconds and shares the existing daily reward limits.
- Duel: invite one neighbor in the same village. All patrols and both processions collide with both players. Last survivor wins; simultaneous contacts draw; leaving forfeits.
- Controls: physical WASD / arrow keys or the mobile analog joystick. Inputs expire on the server after 400 ms without refresh.
- Simulation: 30 Hz server authority; about 20 Hz snapshots; continuous frame-based local movement prediction, input acknowledgement replay and eased visual corrections. Camera half-size is 8.2 m (previously 14 m), with player tracking. No per-frame database writes. Static scenery and wave beads are instanced; stationary scenery shadows are cached and moving actors use contact shadows. The background village stops periodic rendering while a minigame is open.
- Checks: `npm test`, `npm run build`, desktop keyboard play and 390 × 844 mobile layout.
