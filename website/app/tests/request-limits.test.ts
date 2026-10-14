import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleShared,type SharedEnv} from '../src/lib/shared-api.server';
class DB{
 raw=new Database(':memory:');constructor(){for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('migrations/'+f,'utf8'));}
 prepare(sql:string){const db=this;let args:any[]=[];return {bind(...v:any[]){args=v;return this},async first(){return db.raw.prepare(sql).get(...args)},async all(){return {results:db.raw.prepare(sql).all(...args)}},async run(){return {meta:{changes:db.raw.prepare(sql).run(...args).changes}}}};}
 async batch(ss:any[]){this.raw.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());this.raw.exec('COMMIT');return r}catch(e){this.raw.exec('ROLLBACK');throw e}}
}
function oversized(){let pulls=0,cancelled=false;const stream=new ReadableStream<Uint8Array>({pull(controller){if(pulls++<100)controller.enqueue(new Uint8Array(65536));else controller.close()},cancel(){cancelled=true}});return {stream,get pulls(){return pulls},get cancelled(){return cancelled}};}
const origin='https://mazraati-preview.laithlaith500.workers.dev';
const setup=(db:DB)=>({DB:db,APP_ENV:'preview',REQUIRE_PHONE_AUTH:'true',DEMO_AUTH_HOST:'mazraati-preview.laithlaith500.workers.dev',DEMO_AUTH_PHONE:'+9647700000000',DEMO_AUTH_CODE:'123456',ADMIN_PASSWORD:'synthetic-private-fixture-password'} as unknown as SharedEnv);
test('customer and owner push registration reject oversized streams before decoding',async()=>{
 const db=new DB(),env=setup(db);const post=(path:string,value:unknown,cookie='')=>handleShared(new Request(origin+'/api/v2/'+path,{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(value)}),env);
 try{
  const owner=await post('login',{password:env.ADMIN_PASSWORD});expect(owner.status).toBe(200);
  const start=await post('account/start',{phone:'07700000000'});expect(start.status).toBe(200);
  const customer=await post('account/check',{code:'123456'},start.headers.get('set-cookie')!.split(';')[0]);expect(customer.status).toBe(200);
  for(const [path,cookie] of [['owner/push/device',owner.headers.get('set-cookie')!.split(';')[0]],['push/device',customer.headers.get('set-cookie')!.split(';')[0]]]){
   const large=oversized();const r=await handleShared(new Request(origin+'/api/v2/'+path,{method:'POST',headers:{Origin:origin,Cookie:cookie},body:large.stream}),env);
   expect(r.status).toBe(413);expect(large.cancelled).toBe(true);expect(large.pulls).toBeLessThan(5);
  }
 }finally{db.raw.close()}
});
test('auth and shared JSON reject oversized streams without Content-Length before draining',async()=>{
 for(const path of ['account/start','login']){
  const db=new DB(),env=setup(db),large=oversized();try{
   const r=await handleShared(new Request(origin+'/api/v2/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:large.stream}),env);
   expect(r.status).toBe(413);expect(large.cancelled).toBe(true);expect(large.pulls).toBeLessThan(5);
  }finally{db.raw.close()}
 }
});
test('admin photo uploads enforce their multipart byte cap before parsing an unbounded stream',async()=>{
 const db=new DB(),env=setup(db),large=oversized();env.STORAGE={put(){throw Error('No upload permitted')}} as any;
 try{
  const login=await handleShared(new Request(origin+'/api/v2/login',{method:'POST',headers:{Origin:origin},body:JSON.stringify({password:env.ADMIN_PASSWORD})}),env),cookie=login.headers.get('set-cookie')!.split(';')[0];
  const r=await handleShared(new Request(origin+'/api/v2/owner/photos',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'multipart/form-data; boundary=fixture'},body:large.stream}),env);
  expect(r.status).toBe(413);expect(large.cancelled).toBe(true);expect(large.pulls).toBeLessThan(40);
 }finally{db.raw.close()}
});
test('deleting and re-verifying the same phone does not reset the daily booking budget',async()=>{
 const db=new DB(),env=setup(db);let cookie='';
 const call=async(path:string,method='GET',value?:unknown)=>{const r=await handleShared(new Request(origin+'/api/v2/'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.1'},body:value===undefined?undefined:JSON.stringify(value)}),env);return {r,data:await r.json() as any}};
 const signin=async()=>{const start=await call('account/start','POST',{phone:'07700000000'});cookie=start.r.headers.get('set-cookie')!.split(';')[0];const signed=await call('account/check','POST',{code:'123456'});expect(signed.r.status).toBe(200);cookie=signed.r.headers.get('set-cookie')!.split(';')[0]};
 try{
  const login=await call('login','POST',{password:env.ADMIN_PASSWORD});cookie=login.r.headers.get('set-cookie')!.split(';')[0];
  const farm=(await call('owner/farms','POST',{name:'اختبار',region:'بغداد',area:'اختبار',description:'اختبار',price:100000,capacity:10,amenities:'',images:['/assets/standalone-farm.svg'],published:true})).data.farm;
  await signin();const book=()=>call('bookings','POST',{farmId:farm.id,date:new Date(Date.now()+20*86400000).toISOString().slice(0,10),period:'morning',guests:1,name:'اختبار',phone:'07700000000',notes:'',requestId:crypto.randomUUID()});
  for(let i=0;i<15;i++)expect((await book()).r.status).toBe(201);expect((await book()).r.status).toBe(429);
  expect((await call('device','DELETE')).r.status).toBe(200);await signin();expect((await book()).r.status).toBe(429);
 }finally{db.raw.close()}
});
