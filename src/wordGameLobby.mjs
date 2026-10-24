export function wordGameLobby(members,rooms,meId,kind){
  const activeRooms=rooms.filter(room=>room.status!=='finished');
  const friends=[...new Map(members.filter(member=>member.userId!==meId&&(!member.actorKind||member.actorKind==='PLAYER')).map(member=>[member.userId,member])).values()].map(member=>{
    const active=activeRooms.find(room=>room.players.some(player=>player.id===member.userId));
    const joinable=active?.status==='waiting'&&active.kind===kind&&active.players.length===1?active:null;
    return {...member,joinable,busy:!joinable&&(!!active||!!member.runnerBusy)};
  });
  return {friends,available:friends.filter(friend=>!friend.busy).length,waitingRooms:activeRooms.filter(room=>room.status==='waiting'&&room.kind===kind&&room.players.length===1&&!room.players.some(player=>player.id===meId))};
}
