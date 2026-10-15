import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, SlidersHorizontal, Volume2 } from 'lucide-react';
import './play-controls.css';

const MusicContext = createContext(null);
const readPreference = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); }
  catch { return fallback; }
};
const savePreference = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

export function MusicProvider({ children }) {
  const audio = useRef(null);
  const [enabled, setEnabled] = useState(() => readPreference('pieona.music.enabled', true) === true);
  const [volume, setVolume] = useState(() => {
    const saved = readPreference('pieona.music.volume', .3);
    return typeof saved === 'number' && Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : .3;
  });
  const [playing, setPlaying] = useState(false);
  const [ducked, setDucked] = useState(false);
  const [error, setError] = useState('');
  const play = () => {
    const player = audio.current;
    if (!player) return;
    if (player.error) player.load();
    setError('');
    player.play().catch(e => {
      // Browsers may require a click before allowing audible playback.
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError('음악을 불러오지 못했어요. 재생 버튼으로 다시 시도해 주세요.');
    });
  };
  useEffect(() => {
    audio.current.volume = volume * (ducked ? .15 : 1);
    savePreference('pieona.music.volume', volume);
  }, [volume, ducked]);
  useEffect(() => {
    savePreference('pieona.music.enabled', enabled);
    if (!enabled) { audio.current?.pause(); return; }
    play();
    const unlock = e => {
      if (e.target instanceof Element && e.target.closest('[data-music-controls]')) return;
      if (e.type === 'keydown' && (e.ctrlKey || e.altKey || e.metaKey || e.repeat)) return;
      if (audio.current?.paused) play();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, [enabled]);
  const toggle = () => {
    if (playing) { setEnabled(false); audio.current.pause(); }
    else { setEnabled(true); play(); }
  };
  return <MusicContext.Provider value={{ playing, enabled, volume, setVolume, toggle, error, ducked, setDucked }}>
    {children}
    <audio ref={audio} src="/audio/S_Vilage_v2.mp3" preload="metadata" loop
      onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onError={() => { setPlaying(false); setError('음악을 불러오지 못했어요. 재생 버튼으로 다시 시도해 주세요.'); }}/>
  </MusicContext.Provider>;
}

export const useBackgroundMusic = () => useContext(MusicContext);

export function MusicControls() {
  const { playing, volume, setVolume, toggle, error, ducked } = useBackgroundMusic();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const settingsButton = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    const escape = e => { if (e.key === 'Escape') { setOpen(false); settingsButton.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="music-controls" data-music-controls ref={root}>
    <button type="button" className={'music-toggle ' + (playing ? 'playing' : '')}
      aria-label={playing ? '배경음악 일시정지' : '배경음악 재생'} title={playing ? '배경음악 일시정지' : '배경음악 재생'} onClick={toggle}>
      <Music2 size={17}/><span>BGM</span>{playing ? <Pause size={12}/> : <Play size={12}/>}
    </button>
    <button type="button" className="music-settings" aria-label="배경음악 음량 조절" aria-expanded={open}
      ref={settingsButton} onClick={() => setOpen(!open)}><SlidersHorizontal size={15}/></button>
    {open && <div className="music-popover" aria-label="배경음악 설정">
      <strong><Music2 size={16}/>마을의 배경음악</strong>
      <p>S_Vilage_v2 · 반복 재생</p>
      <label><span><Volume2 size={15}/>음량 <output>{Math.round(volume * 100)}%</output></span>
        <input type="range" aria-label="배경음악 음량" min="0" max="100" step="1" value={Math.round(volume * 100)}
          onChange={e => setVolume(Number(e.target.value) / 100)}/>
      </label>
      {ducked && <small>리듬게임·음성 입력 중에는 음악이 작아져요.</small>}
      {error ? <p role="alert" className="music-error">{error}</p> : !playing && <small>재생 버튼을 누르면 음악이 시작돼요.</small>}
    </div>}
  </div>;
}
