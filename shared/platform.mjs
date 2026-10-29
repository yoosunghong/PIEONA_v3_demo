export const DEFAULT_PLATFORM_COLOR='#9296ae';
export const platformColors=['#9296ae','#8aa88c','#b3a3c7','#d6b99a','#8bb3c9','#b9bec8','#7e889b','#b9a4ad'];
export const isPlatformColor=color=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color);
export const platformColor=village=>isPlatformColor(village?.platformColor)?village.platformColor:DEFAULT_PLATFORM_COLOR;
