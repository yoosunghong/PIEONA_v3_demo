import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

export async function harness(options={}){
  let time=Date.now();const sockets=[];
  const runtime=createApp({testing:true,store:openStore(':memory:'),lifeClock:()=>time,...options});
  await new Promise(resolve=>runtime.server.listen(options.port||0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${runtime.server.address().port}`;
  async function request(path,user,body,method=body?'POST':'GET'){
    const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function register(username){const result=await request('/auth/register',null,{username,password:'village-test-password'});assert.equal(result.status,201);return {...result.body.user,cookie:result.cookie};}
  const emit=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(3000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
  async function connect(user,room=user.id){const socket=io(base,{transports:['websocket'],extraHeaders:{Cookie:user.cookie},forceNew:true});sockets.push(socket);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});assert.equal((await emit(socket,'village:join',{villageId:room})).ok,true);return socket;}
  return {runtime,request,register,connect,emit,advance(ms){time+=ms;runtime.life.tick();},async close(){sockets.forEach(socket=>socket.disconnect());await runtime.close();}};
}
