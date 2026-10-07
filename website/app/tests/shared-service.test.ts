import {test,expect} from "bun:test";
import {Database} from "bun:sqlite";
import {readFileSync} from "node:fs";
import {handleShared,type SharedEnv} from "../src/lib/shared-api.server";
class DB{
 raw=new Database(":memory:");constructor(applyPeriods=true){this.raw.exec(readFileSync("migrations/0001_shared_mazraaty.sql","utf8"));if(applyPeriods)this.raw.exec(readFileSync("migrations/0002_booking_periods.sql","utf8"));}
 prepare(sql:string){const db=this;let args:unknown[]=[];return {bind(...values:unknown[]){args=values;return this;},async first(){return db.raw.prepare(sql).get(...args as any[]);},async all(){return {results:db.raw.prepare(sql).all(...args as any[])};},async run(){const result=db.raw.prepare(sql).run(...args as any[]);return {meta:{changes:result.changes}};}};}
 async batch(statements:any[]){this.raw.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await s.run());this.raw.exec("COMMIT");return out;}catch(e){this.raw.exec("ROLLBACK");throw e;}}
}
test("owner-only changes, cross-device booking, conflicting dates, erasure and replay",async()=>{
 const db=new DB(),password=crypto.randomUUID()+crypto.randomUUID(),env={DB:db,ADMIN_PASSWORD:password} as unknown as SharedEnv;
 const origin="https://test.mazraaty.invalid";
 async function call(path:string,method="GET",value?:unknown,cookie="",token=""){const headers:Record<string,string>={Origin:origin,"CF-Connecting-IP":"127.0.0.1"};if(value!==undefined)headers["Content-Type"]="application/json";if(cookie)headers.Cookie=cookie;if(token)headers["X-Device-Token"]=token;
 const r=await handleShared(new Request(origin+"/api/v2/"+path,{method,headers,body:value===undefined?undefined:JSON.stringify(value)}),env);return {r,data:await r.json() as any};}
 expect((await call("owner/farms")).r.status).toBe(401);
 expect((await call("owner/farms","POST",{})).r.status).toBe(401);
 expect((await call("login","POST",{password:"wrong"})).r.status).toBe(401);
 const login=await call("login","POST",{password}),cookie=login.r.headers.get("set-cookie")!.split(";")[0];expect(login.r.status).toBe(200);
 const input={name:"مزرعة اختبار",region:"بغداد",area:"اختبار",description:"بيانات اختبار مؤقتة",price:150000,eveningPrice:200000,capacity:12,amenities:"مسبح",images:["/assets/standalone-farm.svg"],published:false};
 const created=await call("owner/farms","POST",input,cookie),farm=created.data.farm;expect(created.r.status).toBe(201);expect((await call("catalog")).data.farms.length).toBe(0);
 expect((await call("owner/farms/"+farm.id,"PATCH",{...input,published:true,revision:farm.revision},cookie)).r.status).toBe(200);expect((await call("catalog")).data.farms.length).toBe(1);
 expect((await call("owner/farms/"+farm.id,"PATCH",{...input,revision:1},cookie)).r.status).toBe(409);
 const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10),token1="a".repeat(64),token2="b".repeat(64);
 const booking={farmId:farm.id,date,period:"morning",guests:4,name:"زبون تجريبي",phone:"07700000000",notes:"",requestId:crypto.randomUUID()};
 const yesterday=new Date(Date.now()+10800000-86400000).toISOString().slice(0,10);
 expect((await call("bookings","POST",{...booking,date:yesterday,requestId:crypto.randomUUID()},"",token1)).r.status).toBe(400);
 expect((await call("bookings","POST",{...booking,date:"2020-01-01",requestId:crypto.randomUUID()},"",token1)).r.status).toBe(400);
 const first=await call("bookings","POST",booking,"",token1);expect(first.r.status).toBe(201);expect(first.data.booking.total).toBe(150000);
 const replay=await call("bookings","POST",booking,"",token1);expect(replay.data.booking.id).toBe(first.data.booking.id);
 expect((await call("bookings","POST",{...booking,guests:5},"",token1)).r.status).toBe(409);
 const second=await call("bookings","POST",{...booking,requestId:crypto.randomUUID()},"",token2);expect(second.r.status).toBe(201);
 expect((await call("bookings","GET",undefined,"",token2)).data.bookings[0].id).toBe(second.data.booking.id);
 expect((await call("owner/bookings/"+first.data.booking.id,"PATCH",{status:"confirmed"},cookie)).r.status).toBe(200);
 expect((await call("owner/bookings/"+second.data.booking.id,"PATCH",{status:"confirmed"},cookie)).r.status).toBe(409);
 expect((await call("unavailable?farmId="+farm.id+"&period=morning")).data.dates).toEqual([date]);
 expect((await call("bookings","POST",{...booking,requestId:crypto.randomUUID()},"","c".repeat(64))).r.status).toBe(409);
 const evening=await call("bookings","POST",{...booking,period:"evening",requestId:crypto.randomUUID()},"",token2);expect(evening.r.status).toBe(201);expect(evening.data.booking.total).toBe(200000);
 expect((await call("owner/bookings/"+evening.data.booking.id,"PATCH",{status:"confirmed"},cookie)).r.status).toBe(200);
 expect((await call("unavailable?farmId="+farm.id+"&period=evening")).data.dates).toEqual([date]);
 expect((await call("catalog")).data.farms[0].confirmedBookings).toBe(2);
 const both=(await call("unavailable?farmId="+farm.id)).data;expect(both.dates).toEqual([date]);expect(both.slots.length).toBe(2);
 expect((await call("bookings","POST",{...booking,period:"midnight",requestId:crypto.randomUUID()},"",token2)).r.status).toBe(400);
 const nextDate=new Date(new Date(date+"T12:00:00Z").getTime()+86400000).toISOString().slice(0,10);
 const nextMorning=await call("bookings","POST",{...booking,date:nextDate,requestId:crypto.randomUUID()},"",token2);expect(nextMorning.r.status).toBe(201);
 expect((await call("owner/bookings/"+nextMorning.data.booking.id,"PATCH",{status:"confirmed"},cookie)).r.status).toBe(200);
 expect((await call("unavailable?farmId="+farm.id+"&period=morning")).data.dates).toEqual([date,nextDate]);
 expect((await call("bookings/"+first.data.booking.id+"/cancel","POST",{},"",token2)).r.status).toBe(404);
 expect((await call("device","DELETE",undefined,"",token1)).r.status).toBe(200);
 expect((await call("bookings","GET",undefined,"",token1)).r.status).toBe(401);
 const owned=(await call("owner/bookings","GET",undefined,cookie)).data.bookings;expect(owned.find((b:any)=>b.id===first.data.booking.id).name).toBe("");
 expect((await call("unavailable?farmId="+farm.id+"&period=morning")).data.dates).toEqual([date,nextDate]);
 expect((await call("owner/bookings/"+first.data.booking.id,"PATCH",{status:"cancelled"},cookie)).r.status).toBe(200);
 expect((await call("unavailable?farmId="+farm.id+"&period=morning")).data.dates).toEqual([nextDate]);
 expect((await call("unavailable?farmId="+farm.id+"&period=evening")).data.dates).toEqual([date]);
 expect((await call("unavailable?farmId="+farm.id)).data.dates).toEqual([]);
 const legacyDate=new Date(new Date(nextDate+"T12:00:00Z").getTime()+86400000).toISOString().slice(0,10);
 db.raw.prepare("UPDATE bookings SET period='full_day',date=? WHERE id=?").run(legacyDate,second.data.booking.id);
 expect((await call("owner/bookings/"+second.data.booking.id,"PATCH",{status:"confirmed"},cookie)).r.status).toBe(200);
 expect((await call("unavailable?farmId="+farm.id)).data.dates).toEqual([legacyDate]);
 expect((await call("bookings","POST",{...booking,date:legacyDate,requestId:crypto.randomUUID()},"",token2)).r.status).toBe(409);
 expect((await call("bookings","POST",{...booking,date:legacyDate,period:"evening",requestId:crypto.randomUUID()},"",token2)).r.status).toBe(409);
 const cross=new Request(origin+"/api/v2/login",{method:"POST",headers:{Origin:"https://evil.invalid","Content-Type":"application/json"},body:JSON.stringify({password})});expect((await handleShared(cross,env)).status).toBe(403);
 const changed={...env,ADMIN_PASSWORD:crypto.randomUUID()+crypto.randomUUID()};expect((await handleShared(new Request(origin+"/api/v2/owner/status",{headers:{Cookie:cookie}}),changed)).status).toBe(401);
 db.raw.close();
});


test("migration keeps legacy full-day bookings blocking both periods",()=>{const db=new DB(false);db.raw.exec("INSERT INTO reserved_dates(farm_id,date,booking_id) VALUES('legacy-farm','2030-01-01','legacy-booking')");db.raw.exec(readFileSync("migrations/0002_booking_periods.sql","utf8"));expect(db.raw.prepare("SELECT period FROM reserved_dates ORDER BY period").all()).toEqual([{period:"evening"},{period:"morning"}]);expect(()=>db.raw.prepare("INSERT INTO reserved_dates(farm_id,date,period,booking_id) VALUES('legacy-farm','2030-01-01','morning','another')").run()).toThrow();expect(()=>db.raw.prepare("INSERT INTO reserved_dates(farm_id,date,period,booking_id) VALUES('legacy-farm','2030-01-01','evening','another')").run()).toThrow();db.raw.prepare("DELETE FROM reserved_dates WHERE booking_id='legacy-booking'").run();expect(db.raw.prepare("SELECT COUNT(*) AS n FROM reserved_dates").get()).toEqual({n:0});db.raw.close();});
