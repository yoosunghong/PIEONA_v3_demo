import { fileURLToPath } from 'node:url';
import { dirname,resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
dotenv.config();
if(existsSync('data/cloudflare/production-on-oracle.json')){
  console.error('Production tunnel is hosted on Oracle. Use start-local.bat for development; see docs/cicd.md before moving the tunnel back.');process.exit(1);
}
const token=process.env.CLOUDFLARE_TUNNEL_TOKEN;
if(!token&&!existsSync('data/cloudflare/credentials.json')){
  console.error('Tunnel credentials missing. See README.md: Cloudflare setup.');process.exit(1);
}
const args=token?['tunnel','--no-autoupdate','run']:['tunnel','--config',resolve('cloudflare/config.yml'),'--no-autoupdate','run'];
const child=spawn('cloudflared',args,{stdio:'inherit',windowsHide:true,env:{...process.env,...(token?{TUNNEL_TOKEN:token}:{})}});
child.on('error',()=>{console.error('Install cloudflared or add it to PATH.');process.exit(1);});
child.on('exit',code=>process.exit(code||0));
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());
