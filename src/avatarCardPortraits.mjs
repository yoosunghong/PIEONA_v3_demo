export const avatarCardPortraits={
  pio:{name:'피오',src:'/images/avatar-cards/pio-profile.png'},
  luna:{name:'루나',src:'/images/avatar-cards/luna-profile.png'},
  moa:{name:'모아',src:'/images/avatar-cards/moa-profile.png'},
  tori:{name:'토리',src:'/images/avatar-cards/tori-profile.png'}
};
export const cardPortrait=character=>avatarCardPortraits[character]||avatarCardPortraits.pio;
