import dotenv from 'dotenv';
import { createApp } from './app.mjs';
// The explicitly requested .env AI configuration takes precedence over inherited shell placeholders.
const fileEnvironment=dotenv.config().parsed||{};
for(const key of ['GEMINI_API_KEY','GEMINI_MODEL'])if(Object.hasOwn(fileEnvironment,key))process.env[key]=fileEnvironment[key];
const runtime=createApp();
const port=Number(process.env.PORT||3000);const host=process.env.HOST||'127.0.0.1';
runtime.server.listen(port,host,()=>console.log(`PIEONA is blooming at http://${host}:${port}\nAI: ${process.env.GEMINI_API_KEY?'Gemini':'local experience (set GEMINI_API_KEY in .env)'}\nPublic origin: ${process.env.PUBLIC_ORIGIN||'https://pieona.yoosung.dev'}`));
let stopping=false;async function stop(){if(stopping)return;stopping=true;await runtime.close();process.exit();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
