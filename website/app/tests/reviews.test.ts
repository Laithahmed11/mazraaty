import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleShared,type SharedEnv} from '../src/lib/shared-api.server';
import {pushHash} from '../src/lib/push.server';
import {bookingEnd} from '../src/lib/booking-time';
test('reviews require the verified owner and a finished confirmed slot; deletion removes ratings',async()=>{
 const raw=new Database(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())raw.exec(readFileSync('migrations/'+f,'utf8'));
 const db={prepare(sql:string){let values:any[]=[];return {bind(...v:any[]){values=v;return this;},async first(){return raw.prepare(sql).get(...values);},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){return {meta:{changes:raw.prepare(sql).run(...values).changes}};}};},async batch(list:any[]){return raw.transaction(()=>list.map(s=>s.run()))();}};
 const origin='https://preview.invalid',cookie='a'.repeat(64),other='b'.repeat(64),token='c'.repeat(64),principal=await pushHash(token);
 const env={DB:db,APP_ENV:'preview',REQUIRE_PHONE_AUTH:'true',DEMO_AUTH_HOST:'preview.invalid',DEMO_AUTH_PHONE:'+9647700000000',DEMO_AUTH_CODE:'123456'} as unknown as SharedEnv;
 raw.prepare("INSERT INTO customers VALUES('customer','+9647700000000',?,'2026-01-01')").run(token);
 raw.prepare("INSERT INTO customer_sessions VALUES(?,'customer',?)").run(await pushHash(cookie),Math.floor(Date.now()/1000)+3600);
 raw.prepare("INSERT INTO customers VALUES('other','+9647700000001',?,'2026-01-01')").run('d'.repeat(64));
 raw.prepare("INSERT INTO customer_sessions VALUES(?,'other',?)").run(await pushHash(other),Math.floor(Date.now()/1000)+3600);
 raw.prepare('INSERT INTO devices VALUES(?,0)').run(principal);
 raw.exec("INSERT INTO farms(id,name,region,area,description,price,capacity,amenities,images,published,updated_at) VALUES('farm','مزرعة','بغداد','منطقة','وصف',100,10,'','[]',1,'2026-01-01')");
 raw.prepare("INSERT INTO bookings(id,device_hash,request_id,payload_hash,farm_id,farm_name,date,period,guests,customer_name,phone,notes,total,status,created_at) VALUES('booking',?,'request','payload','farm','مزرعة','2020-01-01','evening',1,'اسم','+9647700000000','',100,'confirmed','2020-01-01')").run(principal);
 const call=(who:string,stars=5,requestOrigin=origin)=>handleShared(new Request(origin+'/api/v2/bookings/booking/review',{method:'POST',headers:{Cookie:'mazraaty_customer='+who,Origin:requestOrigin},body:JSON.stringify({stars})}),env);
 try{
  expect((await call('')).status).toBe(401);expect((await call(other)).status).toBe(404);expect((await call(cookie,5,'https://evil.invalid')).status).toBe(403);expect((await call(cookie,6)).status).toBe(400);
  raw.exec("UPDATE bookings SET date='2099-01-01'");expect((await call(cookie)).status).toBe(409);
  raw.exec("UPDATE bookings SET date='2020-01-01',status='cancelled'");expect((await call(cookie)).status).toBe(409);
  raw.exec("UPDATE bookings SET status='confirmed'");expect((await call(cookie,4)).status).toBe(200);expect((await call(cookie,5)).status).toBe(200);
  expect(raw.query('SELECT COUNT(*) AS n, MAX(stars) AS stars FROM farm_reviews').get()).toEqual({n:1,stars:5});
  raw.prepare('UPDATE devices SET revoked=1 WHERE hash=?').run(principal);expect(raw.query('SELECT COUNT(*) AS n FROM farm_reviews').get()).toEqual({n:0});expect(raw.query('SELECT COUNT(*) AS n FROM deletion_ledger').get()).toEqual({n:1});
  expect(bookingEnd('2026-10-10','evening')).toBe(Date.parse('2026-10-11T01:00:00Z'));expect(bookingEnd('2026-10-10','morning')).toBe(Date.parse('2026-10-10T15:00:00Z'));
 }finally{raw.close();}
});
