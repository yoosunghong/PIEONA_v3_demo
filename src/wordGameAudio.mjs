export function createChainAudio(){
  let context,disposed=false;
  function unlock(){
    if(disposed)return;
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context??=new Audio();context.resume().catch(()=>{});}catch{}
  }
  return {unlock,correct(){
    if(!context||context.state!=='running'||disposed)return;
    const at=context.currentTime;
    [660,880,1100].forEach((frequency,i)=>{
      const tone=context.createOscillator(),gain=context.createGain(),start=at+i*.07;
      tone.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.055,start+.01);gain.gain.exponentialRampToValueAtTime(.001,start+.18);
      tone.connect(gain);gain.connect(context.destination);tone.onended=()=>{tone.disconnect();gain.disconnect();};tone.start(start);tone.stop(start+.2);
    });
  },dispose(){disposed=true;context?.close().catch(()=>{});}};
}
