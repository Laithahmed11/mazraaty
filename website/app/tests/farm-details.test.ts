import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleShared,type SharedEnv} from '../src/lib/shared-api.server';
class DB {
 raw=new Database(':memory:');
 constructor(){for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('migrations/'+f,'utf8'));}
 prepare(sql:string){const db=this;let args:any[]=[];return {bind(...v:any[]){args=v;return this},async first(){return db.raw.prepare(sql).get(...args)},async all(){return {results:db.raw.prepare(sql).all(...args)}},async run(){const r=db.raw.prepare(sql).run(...args);return {meta:{changes:r.changes}}}};}
 async batch(ss:any[]){this.raw.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());this.raw.exec('COMMIT');return r}catch(e){this.raw.exec('ROLLBACK');throw e}}
}
test('farm details and dated offers are owner-only; booking price is fixed server-side',async()=>{
 const db=new DB(),origin='https://test.mazraaty.invalid',env={DB:db,ADMIN_PASSWORD:'test-admin-password-long-enough'} as unknown as SharedEnv;
 async function call(path:string,method='GET',value?:unknown,cookie='',token='a'.repeat(64)){
  const r=await handleShared(new Request(origin+'/api/v2/'+path,{method,headers:{Origin:origin,Cookie:cookie,'X-Device-Token':token,'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)}),env);return {r,data:await r.json() as any};
 }
 const cookie=(await call('login','POST',{password:env.ADMIN_PASSWORD})).r.headers.get('set-cookie')!.split(';')[0];
 const day=new Date(Date.now()+10*86400000).toISOString().slice(0,10),end=new Date(Date.now()+12*86400000).toISOString().slice(0,10);
 const farmInput={name:'مزرعة اختبار',region:'بغداد',area:'اختبار',description:'وصف',price:150000,eveningPrice:200000,capacity:15,amenities:'مسبح',images:['/assets/standalone-farm.svg'],published:true,details:{poolDepth:1.5,rooms:3,bathrooms:2,latitude:33.3,longitude:44.3,rules:'قواعد المكان',cancellationPolicy:'تواصل قبل الإلغاء'},offer:{from:day,to:end,morning:100000,evening:170000}};
 expect((await call('owner/farms','POST',farmInput)).r.status).toBe(401);
 const saved=await call('owner/farms','POST',farmInput,cookie);expect(saved.r.status).toBe(201);const f=saved.data.farm;
 expect(f.details.poolDepth).toBe(1.5);expect((await call('catalog')).data.farms[0].offer.morning).toBe(100000);
 expect((await call('owner/farms','POST',{...farmInput,details:{latitude:99,longitude:44}},cookie)).r.status).toBe(400);
 expect((await call('owner/farms','POST',{...farmInput,offer:{...farmInput.offer,morning:160000}},cookie)).r.status).toBe(400);
 expect((await call('owner/farms','POST',{...farmInput,offer:{...farmInput.offer,to:'2030-02-30'}},cookie)).r.status).toBe(400);
 const input={farmId:f.id,date:day,period:'morning',guests:3,name:'اختبار',phone:'07700000000',notes:'',requestId:crypto.randomUUID(),total:1};
 expect((await call('bookings','POST',{...input,expectedTotal:150000})).r.status).toBe(409);
 expect((await call('bookings','POST',{...input,whatsappOptIn:'yes'})).r.status).toBe(400);
 const b=await call('bookings','POST',input);expect(b.r.status).toBe(201);expect(b.data.booking.total).toBe(100000);
 expect((await call('owner/farms/'+f.id,'PATCH',{...farmInput,offer:null,revision:f.revision},cookie)).r.status).toBe(200);
 expect((await call('bookings','POST',input)).data.booking.total).toBe(100000);
 const fresh=await call('bookings','POST',{...input,period:'evening',requestId:crypto.randomUUID()});expect(fresh.data.booking.total).toBe(200000);
 const consentId=crypto.randomUUID();const consent=await call('bookings','POST',{...input,whatsappOptIn:true,requestId:consentId});expect(consent.data.booking.whatsappOptIn).toBe(true);
 expect((await call('bookings','POST',{...input,whatsappOptIn:false,requestId:consentId})).r.status).toBe(409);
 expect((await call('bookings/'+consent.data.booking.id+'/whatsapp-consent','POST',{optIn:false},'','b'.repeat(64))).r.status).toBe(404);
 expect((await call('bookings/'+consent.data.booking.id+'/whatsapp-consent','POST',{optIn:true})).r.status).toBe(400);
 expect((await call('bookings/'+consent.data.booking.id+'/whatsapp-consent','POST',{optIn:false})).data.booking.whatsappOptIn).toBe(false);
 db.raw.close();
});
