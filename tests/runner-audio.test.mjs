import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunnerAudio} from '../src/runnerAudio.mjs';

test('seed chime respects mute, plays two short rising tones, and releases audio resources',async()=>{
  let context;
  class AudioContext{
    state='suspended';currentTime=10;destination={};tones=[];gains=[];
    constructor(){context=this;}
    resume(){this.state='running';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createOscillator(){const tone={frequency:{setValueAtTime(value){tone.pitch=value;}},connect(){},disconnect(){tone.disconnected=true;},start(at){tone.startAt=at;},stop(at){tone.stopAt=at;}};this.tones.push(tone);return tone;}
    createGain(){const gain={gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){gain.disconnected=true;}};this.gains.push(gain);return gain;}
  }
  const audio=createRunnerAudio(AudioContext);
  audio.seed();assert.equal(context,undefined,'sound must wait for a user gesture');
  audio.unlock();audio.seed(0);assert.equal(context.tones.length,0);
  audio.seed(.3);
  assert.deepEqual(context.tones.map(t=>t.pitch),[880,1320]);
  assert.ok(context.tones.every(t=>t.stopAt-t.startAt<.2));
  for(const tone of context.tones)tone.onended();
  assert.ok([...context.tones,...context.gains].every(node=>node.disconnected));
  audio.dispose();assert.equal(context.state,'closed');
  audio.seed();assert.equal(context.tones.length,2);
  assert.doesNotThrow(()=>{const unsupported=createRunnerAudio();unsupported.unlock();unsupported.seed();unsupported.dispose();});
});
