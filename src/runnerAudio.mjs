// Unlock from a player gesture so automatic seed pickups can play in browsers.
export function createRunnerAudio(AudioContext){
  let context;
  return {
    unlock(){
      if(!AudioContext)return;
      try{context??=new AudioContext();if(context.state==='suspended')context.resume().catch(()=>{});}catch{}
    },
    seed(volume=.3){
      if(context?.state!=='running'||volume<=0)return;
      const start=context.currentTime;
      for(const [offset,frequency] of [[0,880],[.065,1320]]){
        const tone=context.createOscillator(),gain=context.createGain(),at=start+offset;
        tone.type='sine';tone.frequency.setValueAtTime(frequency,at);
        gain.gain.setValueAtTime(.001,at);
        gain.gain.exponentialRampToValueAtTime(Math.max(.001,Math.min(1,volume)*.22),at+.008);
        gain.gain.exponentialRampToValueAtTime(.001,at+.16);
        tone.connect(gain);gain.connect(context.destination);
        tone.onended=()=>{tone.disconnect();gain.disconnect();};
        tone.start(at);tone.stop(at+.17);
      }
    },
    dispose(){context?.close().catch(()=>{});context=undefined;}
  };
}
