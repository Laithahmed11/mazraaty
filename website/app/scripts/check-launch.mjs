import {readFileSync} from 'node:fs';
const origin=process.env.LAUNCH_SITE_URL;
if(!origin||new URL(origin).protocol!=='https:'||new URL(origin).hostname.includes('preview'))throw Error('Set the verified HTTPS launch URL.');
for(const path of ['/privacy','/terms','/delete-account','/support']){
 const r=await fetch(new URL(path,origin));if(!r.ok)throw Error('Public release page failed: '+path);
}
const config=JSON.parse(readFileSync(new URL('../wrangler.deploy.jsonc',import.meta.url),'utf8'));
if(config.name!=='mazraati'||config.vars?.APP_ENV!=='production'||config.vars?.REQUIRE_PHONE_AUTH!=='true'||Object.keys(config.vars||{}).some(k=>k.startsWith('DEMO_')))throw Error('Launch configuration must require real phone authentication without demo credentials.');
const status=await fetch(new URL('/api/v2/account/status',origin)).then(r=>r.json());if(status.demo)throw Error('Demo authentication detected on launch.');
const health=await fetch(new URL('/api/v2/health',origin)).then(r=>r.json());if(!health.online||!health.adminConfigured||!health.phoneConfigured||!health.pushConfigured||health.environment!=='production')throw Error('Launch runtime credentials incomplete.');
// This is a read-only gate. Actual SMS sign-in must still be tested by the owner.
console.log('Public policies and independent production configuration checks passed. Real SMS and physical-device acceptance remain required.');
