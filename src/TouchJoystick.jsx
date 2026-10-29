import React,{useEffect,useRef,useState} from 'react';
import {joystickAxis} from './villageMovement.mjs';
import './touch-joystick.css';

export default function TouchJoystick({input,disabled=false,label='별 이동 조이스틱'}){
  const pointer=useRef(null),pad=useRef(null);
  const [axis,setAxis]=useState({x:0,y:0}),[active,setActive]=useState(false);
  function reset(){
    const id=pointer.current;pointer.current=null;
    input.current={x:0,y:0};setAxis({x:0,y:0});setActive(false);
    if(id!==null&&pad.current?.hasPointerCapture(id))pad.current.releasePointerCapture(id);
  }
  useEffect(()=>{
    function hidden(){if(document.hidden)reset();}
    window.addEventListener('blur',reset);document.addEventListener('visibilitychange',hidden);
    return()=>{input.current={x:0,y:0};window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',hidden);};
  },[input]);
  useEffect(()=>{if(disabled)reset();},[disabled]);
  function move(event){
    if(disabled||pointer.current!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    const rect=event.currentTarget.getBoundingClientRect();
    const value=joystickAxis(event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2);
    input.current=value;setAxis(value);
  }
  return <div className={'touch-joystick '+(disabled?'is-disabled':'')+(active?' is-active':'')}>
    <div ref={pad} className="joystick-pad" role="group" aria-label={label} aria-disabled={disabled}
      onPointerDown={event=>{if(disabled||pointer.current!==null||event.button!==0)return;pointer.current=event.pointerId;setActive(true);event.currentTarget.setPointerCapture(event.pointerId);move(event);}}
      onPointerMove={move} onPointerUp={event=>{if(pointer.current===event.pointerId)reset();}}
      onPointerCancel={event=>{if(pointer.current===event.pointerId)reset();}} onLostPointerCapture={event=>{if(pointer.current===event.pointerId)reset();}}
      onContextMenu={event=>event.preventDefault()}>
      <span className="joystick-cross" aria-hidden="true">✥</span>
      <span className="joystick-knob" style={{transform:`translate(${axis.x*35}px, ${axis.y*35}px)`}} aria-hidden="true"/>
    </div>
  </div>;
}
