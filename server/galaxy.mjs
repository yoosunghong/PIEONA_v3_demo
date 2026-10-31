import {randomBytes} from 'node:crypto';
import {galaxyNpcs} from '../shared/galaxy.mjs';

export function initializeGalaxy(store){
  store.transaction(()=>{
    for(const npc of galaxyNpcs){
      // Reserved usernames cannot be registered; random unreachable credentials never leave the server.
      store.run('INSERT OR IGNORE INTO users(id,username,password,nickname,intro,theme,village,created_at) VALUES(?,?,?,?,?,?,?,?)',npc.id,'@galaxy:'+npc.id,randomBytes(16).toString('hex')+':'+randomBytes(64).toString('hex'),npc.nickname,'별빛 사이에서 새로운 친구를 기다리고 있어요.',npc.theme,JSON.stringify({theme:'milkyway',items:[],platformColor:npc.color}),new Date().toISOString());
      store.run("INSERT OR IGNORE INTO avatar_legacy_experience(owner_id,avatar_slot,xp) VALUES(?,'',?)",npc.id,(npc.level-1)*100);
      for(let i=3;i<npc.count;i++)store.run('INSERT OR IGNORE INTO owned_stars(owner_id,star_id,name) VALUES(?,?,?)',npc.id,'npc-'+i,['소원별','달빛별','꽃잎별','꿈별','새벽별'][i-3]);
    }
  });
}
