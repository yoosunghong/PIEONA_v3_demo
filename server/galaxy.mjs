import {randomBytes} from 'node:crypto';
import {galaxyNpcs} from '../shared/galaxy.mjs';

export function initializeGalaxy(store){
  store.transaction(()=>{
    for(const npc of galaxyNpcs){
      // Reserved usernames cannot be registered; random unreachable credentials never leave the server.
      store.run('INSERT OR IGNORE INTO users(id,username,password,nickname,intro,theme,village,created_at) VALUES(?,?,?,?,?,?,?,?)',npc.id,'@galaxy:'+npc.id,randomBytes(16).toString('hex')+':'+randomBytes(64).toString('hex'),npc.nickname,'별빛 사이에서 새로운 친구를 기다리고 있어요.',npc.theme,JSON.stringify({theme:'milkyway',items:[],platformColor:npc.color}),new Date().toISOString());
      const current=store.one('SELECT * FROM users WHERE id=?',npc.id);
      const appearance={character:npc.character,color:npc.color,hat:'none',accessory:'scarf',ride:'none'};
      const types=npc.character==='pio'?['bush','bench','planter','lantern']:npc.character==='luna'?['crystal','bench','fountain','lantern']:npc.character==='tori'?['mushroomSeat','picnic','flowerLamp','bench']:['bench','lantern','bush','mailbox'];
      const positions=[[-3,-2],[3,-1],[-3,2],[3,2]],village={...JSON.parse(current.village),theme:npc.villageTheme,platformColor:npc.platformColor,items:types.map((type,i)=>({id:`npc-${npc.character}-${i}`,type,x:positions[i][0],z:positions[i][1],rotation:i%2}))};
      const fields=[npc.nickname,npc.interest,npc.theme,JSON.stringify(appearance),JSON.stringify({...JSON.parse(current.avatar_appearance),character:npc.character,color:npc.color}),JSON.stringify(village),JSON.stringify({...JSON.parse(current.settings),publicTags:npc.traits})];
      const old=[current.nickname,current.intro,current.theme,current.appearance,current.avatar_appearance,current.village,current.settings];
      if(fields.some((v,i)=>v!==old[i]))store.run('UPDATE users SET nickname=?,intro=?,theme=?,appearance=?,avatar_appearance=?,village=?,settings=?,revision=revision+1 WHERE id=?',...fields,npc.id);
      store.run("INSERT OR IGNORE INTO avatar_legacy_experience(owner_id,avatar_slot,xp) VALUES(?,'',?)",npc.id,(npc.level-1)*100);
      for(let i=3;i<npc.count;i++)store.run('INSERT OR IGNORE INTO owned_stars(owner_id,star_id,name) VALUES(?,?,?)',npc.id,'npc-'+i,['소원별','달빛별','꽃잎별','꿈별','새벽별'][i-3]);
    }
  });
}
