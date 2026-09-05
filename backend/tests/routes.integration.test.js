const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const enabled=process.env.RUN_DATABASE_TESTS==='1';
test('content calendar isolates source ownership and never claims automatic publication', {skip:!enabled},async()=>{
 if(!new URL(process.env.DATABASE_URL).pathname.includes('inspection_test_'))throw Error('Dedicated test database required');
 process.env.JWT_SECRET='inspection-session-key';
 const express=require('express'),jwt=require('jsonwebtoken'),db=require('../db');
 await db.query(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'));
 await db.query("INSERT INTO users(email,password,name) VALUES('one@example.test','fixture','One'),('two@example.test','fixture','Two')");
 await db.query("INSERT INTO content_library(title,content,user_id) VALUES('Matching source','source',1),('Other source','source',1),('Private source','source',2)");
 const app=express();app.use(express.json());app.use('/schedule',require('../routes/schedule'));app.use('/content',require('../routes/content'));
 const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));
 // Wait for the route's existing initialization query on its own connection.
 await db.query('SELECT 1');
 const token=jwt.sign({id:1},process.env.JWT_SECRET);
 async function request(route,body,method=body?'POST':'GET'){const r=await fetch(`http://127.0.0.1:${listener.address().port}${route}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json()};}
 try{
 const input={platform:'linkedin',publish_at:new Date(Date.now()+86400000).toISOString(),content_id:3};
 assert.equal((await request('/schedule',input)).status,404);
 const saved=await request('/schedule',{...input,content_id:1});assert.equal(saved.status,201,JSON.stringify(saved));assert.equal(saved.body.publicationMode,'manual');
 assert.equal((await request(`/schedule/${saved.body.id}`,{status:'published'},'PUT')).status,400);
 assert.equal((await request(`/schedule/${saved.body.id}`,{publish_at:'2020-01-01'},'PUT')).status,400);
 assert.equal((await request(`/schedule/${saved.body.id}`,{status:'cancelled'},'PUT')).status,200);
 const listed=await request('/content/content_library?search=Matching');assert.equal(listed.body.total,1);assert.equal(listed.body.items.length,1);
 assert.equal((await request('/content/content_library?limit=-1')).status,400);
 }finally{await new Promise(r=>listener.close(r));await db.pool.end();}
});
