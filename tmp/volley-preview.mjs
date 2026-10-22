import {createApp,questions} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
process.env.PUBLIC_ORIGIN='http://127.0.0.1:3011';
const runtime=createApp({testing:true,store:openStore(':memory:')});
await new Promise(r=>runtime.server.listen(3011,'127.0.0.1',r));
const response=await fetch('http://127.0.0.1:3011/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'volley_preview',password:'preview-only-283!'})});
const cookie=response.headers.get('set-cookie').split(';')[0];
await fetch('http://127.0.0.1:3011/api/me',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({nickname:'몽글테스터'})});
await fetch('http://127.0.0.1:3011/api/balance',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({answers:questions.map(q=>({id:q.id,choice:'a'}))})});
console.log('Isolated preview ready on http://127.0.0.1:3011');

