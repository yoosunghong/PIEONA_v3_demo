// Match foldable inner displays by CSS viewport size, not model names or
// physical pixels. Keep this range in sync with the fold media queries.
export function isFoldViewport(width,height){
  const ratio=width/height;
  return Number.isFinite(ratio)&&width>=600&&width<=1100&&height>0&&ratio>=4/5&&ratio<=3/2;
}

export function isFoldCoverViewport(width,height){
  const ratio=width/height;
  return Number.isFinite(ratio)&&width>=280&&width<=450&&height>0&&ratio>=1/3&&ratio<=.45;
}

export function villageFieldOfView(width,height,{mode='village',portrait=false,chatActive=false}={}){
  if(portrait||chatActive||!['home','village'].includes(mode))return 38;
  if(isFoldViewport(width,height))return 46;
  // Cover displays need a horizontal fit: a fixed vertical FOV otherwise crops
  // most of the island as the screen becomes taller and narrower.
  if(isFoldCoverViewport(width,height)){
    const aspect=width/Math.max(1,height-114);
    return Math.min(85,2*Math.atan(Math.tan(38*Math.PI/360)*1.3/aspect)*180/Math.PI);
  }
  return 38;
}
