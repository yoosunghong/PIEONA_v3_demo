export const DRAGON_RIDE='babyDragon';
// The torso hovers at the head of a standing 2.65-unit player.
export const DRAGON_FLIGHT_HEIGHT=1.5;
export const DRAGON_SPEED=5.4;
export const dragonMounted=look=>look?.ride===DRAGON_RIDE;
// Older accounts kept the dragon color in their companion appearance.
export const dragonMountColor=(look={},companion={})=>look.petColor||companion.petColor||'#e8efff';
