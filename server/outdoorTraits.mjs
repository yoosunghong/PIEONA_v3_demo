import {emptyOutdoorProfile,outdoorPersona} from '../shared/outdoorTraits.mjs';
export function readOutdoorProfile(store,uid,slot){
 if(!store.one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='outdoor_profiles'"))return emptyOutdoorProfile();
 const row=store.one('SELECT profile FROM outdoor_profiles WHERE owner_id=? AND slot=?',uid,slot||'');return row?JSON.parse(row.profile):emptyOutdoorProfile();
}
export const effectiveOutdoorPersona=(store,uid,slot,persona)=>outdoorPersona(persona,readOutdoorProfile(store,uid,slot));
