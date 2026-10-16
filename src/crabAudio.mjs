// Original synthesized beach ambience and feedback; no external audio assets.
export function createCrabAudio(){
  let context,master,noise,filter;let enabled=true,volume=.3,active=false;
  function unlock(){
    if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      context=new Audio();master=context.createGain();master.gain.value=enabled&&active?volume*.55:0;master.connect(context.destination);
      const buffer=context.createBuffer(1,context.sampleRate*3,context.sampleRate),data=buffer.getChannelData(0);let last=0;
      for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.025)/1.025;data[i]=last;}
      noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;noise.connect(filter);filter.connect(master);noise.start();
    }context.resume().catch(()=>{});
  }
  function tone(kind){if(!context||!enabled)return;const osc=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
    osc.type='sine';osc.frequency.setValueAtTime(kind==='end'?280:780,now);osc.frequency.exponentialRampToValueAtTime(kind==='end'?80:420,now+.23);gain.gain.setValueAtTime(volume*.22,now);gain.gain.exponentialRampToValueAtTime(.001,now+.3);osc.connect(gain);gain.connect(context.destination);osc.start();osc.stop(now+.31);
  }
  return {unlock,tone,set(on,v,playing){enabled=on;volume=v;active=playing;if(master)master.gain.setTargetAtTime(on&&playing?v*.55:0,context.currentTime,.2);},dispose(){context?.close().catch(()=>{});}};
}
