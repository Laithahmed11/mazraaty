import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync,readdirSync,statSync,unlinkSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const config=process.env.BACKUP_CONFIG||'wrangler.preview.jsonc';
if(!['wrangler.preview.jsonc','wrangler.deploy.jsonc'].includes(config))throw Error('Select a known independent Worker config.');
const folder=fileURLToPath(new URL('../.wrangler/private-backups/',import.meta.url));mkdirSync(folder,{recursive:true});
const path=folder+new Date().toISOString().replaceAll(':','-')+'-'+(config.includes('preview')?'preview':'launch')+'.sql';
// Wrangler prints a signed download URL for exports; keep that private too.
const r=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'d1','export','DB','--remote','--config',config,'--output',path],{stdio:'pipe'});
if(r.status!==0)throw Error('Private database export failed.');
if(!existsSync(path))throw Error('Database export missing.');
if(process.env.BACKUP_UPLOAD==='true'){
 const settings=JSON.parse(readFileSync(config,'utf8'));const bucket=settings.r2_buckets.find(b=>b.binding==='STORAGE')?.bucket_name;
 if(!['mazraaty-preview-photos','mazraaty-photos'].includes(bucket))throw Error('Unexpected backup bucket.');
 const uploaded=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'r2','object','put',bucket+'/__private-backups/'+path.split(/[\\/]/).pop(),'--remote','--file',path,'--content-type','application/sql','--config',config],{stdio:'inherit'});
 if(uploaded.status!==0)throw Error('Off-device backup upload failed.');
}
// Only our timestamped backup files within this fixed private directory.
for(const file of readdirSync(folder))if(/^\d{4}-\d{2}-\d{2}T[\d.-]+Z-(preview|launch)\.sql$/.test(file)&&Date.now()-statSync(folder+file).mtimeMs>30*86400000)unlinkSync(folder+file);
console.log('Private backup created. Do not publish it; preserve the current deletion ledger separately before restoring.');
