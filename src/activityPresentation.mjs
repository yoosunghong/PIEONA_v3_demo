export const activityPresentation={
  minigame:{label:'게임',icon:'game',color:'purple'},
  visit:{label:'마을 방문',icon:'visit',color:'blue'},
  guestbook:{label:'방명록 추가',icon:'guestbook',color:'amber'},
  cheer:{label:'응원',icon:'heart',color:'pink'},
  conversation:{label:'아바타 대화',icon:'chat',color:'green'},
  greeting:{label:'인사',icon:'greeting',color:'teal'}
};
export const presentActivity=type=>activityPresentation[type]||{label:'마을 소식',icon:'bell',color:'blue'};
