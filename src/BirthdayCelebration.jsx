import React, {useEffect, useState} from 'react';
import {isWinterBirthday} from './birthday.mjs';
import './birthday.css';

export default function BirthdayCelebration({nickname, active}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active || !isWinterBirthday(nickname)) { setVisible(false); return; }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 6500);
    return () => clearTimeout(timer);
  }, [nickname, active]);
  if (!visible) return null;
  return <div className="birthday-celebration" role="status" aria-label="겨울이님 생일 축하해요!">
    <div className="birthday-message">🎉 겨울이님, 생일 축하해요! 🎂</div>
    {Array.from({length: 60}, (_, i) => <i key={i} style={{'--x': `${(i * 47) % 100}%`, '--delay': `${(i % 12) * .1}s`, '--duration': `${2.8 + (i % 7) * .22}s`, '--color': ['#ff7dac','#ffd46b','#87dcd5','#b69afa','#fff2b4'][i % 5], '--turn': `${(i % 2 ? 1 : -1) * (250 + i * 11)}deg`}} />)}
  </div>;
}
