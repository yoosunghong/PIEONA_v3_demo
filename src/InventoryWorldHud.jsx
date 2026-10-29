import React from 'react';
import AvatarPortrait from './AvatarPortrait';
import {villageScenery} from '../shared/scenery.mjs';
import {villageLife} from '../shared/lifeLayout.mjs';

export default function InventoryWorldHud({viewer,village={},position}){
  if(!viewer)return null;
  const life=villageLife(village),point=({x=0,z=0})=>({x:100+x*8,y:100+z*8});
  const player=point(position||{x:0,z:3});
  return <div className="inventory-world-hud">
    <div className="inventory-player-hud"><span className="inventory-player-portrait"><AvatarPortrait user={viewer}/></span><span className="inventory-player-level" aria-label={`레벨 ${viewer.level||1}`}>{viewer.level||1}</span><progress aria-label="다음 레벨까지 경험치" value={viewer.levelXp||0} max={viewer.nextLevelXp||100}/></div>
    <div className="inventory-minimap"><svg viewBox="0 0 200 200" role="img" aria-label="별 미니맵과 현재 위치"><defs><radialGradient id="inventory-map-sea"><stop stopColor="#c4f1ed"/><stop offset="1" stopColor="#7fbcd2"/></radialGradient><radialGradient id="inventory-map-land"><stop stopColor="#e2efb4"/><stop offset="1" stopColor="#afce9c"/></radialGradient><clipPath id="inventory-map-clip"><circle cx="100" cy="100" r="96"/></clipPath></defs><g clipPath="url(#inventory-map-clip)"><circle cx="100" cy="100" r="98" fill="url(#inventory-map-sea)"/><ellipse cx="100" cy="98" rx="79" ry="77" fill="#e7dcad"/><ellipse cx="100" cy="96" rx="74" ry="72" fill="url(#inventory-map-land)"/><ellipse cx="125" cy="74" rx="18" ry="12" fill="#8fd9d9" stroke="#e2dba7" strokeWidth="4"/><path d="M103 98Q73 126 103 170M100 99Q61 104 48 92M102 98Q125 113 151 104" fill="none" stroke="#ecdfb6" strokeWidth="12" strokeLinecap="round"/><circle cx="100" cy="100" r="20" fill="#dfe7c3" stroke="#fbf1c7" strokeWidth="3"/>{villageScenery(village).filter(item=>!item.hidden&&item.id.includes('tree-')).map(item=>{const p=point(item);return <g key={item.id} transform={`translate(${p.x} ${p.y})`}><ellipse cy="5" rx="10" ry="6" fill="#6f9f6570"/><circle r="10" fill={item.id.endsWith('0')||item.id.endsWith('3')?'#e7bed2':'#88b889'}/><circle cx="-3" cy="-4" r="6" fill="#ffffff36"/></g>;})}<path d="M54 91h21v14H54z" fill="#d5ae82"/><path d="M50 92l14-11 14 11" fill="#92aeba"/>{[life.storage,life.kitchen,...life.beds].map(item=>{const p=point(item);return <rect key={item.id} x={p.x-4} y={p.y-3} width="8" height="6" rx="1" fill={item.id.startsWith('garden:')?'#96885b':'#e5ba76'} stroke="#fff6df"/>;})}<path d={`M${player.x} ${player.y-8}l-6 15 6-4 6 4z`} fill="#719dff" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/></g><circle cx="100" cy="100" r="97" fill="none" stroke="#ffffffd9" strokeWidth="3"/><text x="99" y="19" fill="#fff" textAnchor="middle" fontSize="12" fontWeight="800">N</text></svg></div>
  </div>;
}
