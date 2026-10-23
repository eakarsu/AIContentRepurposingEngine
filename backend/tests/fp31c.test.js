
'use strict';
delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY;
const test=require('node:test'); const assert=require('node:assert/strict'); const express=require('express');
const { createFeaturePack, FEATURES } = require('../routes/fp31c.js');
test('fp31c tasks/search/export/ai fallback', async()=>{
  const auth=(req,res,next)=>{ req.user={id:7}; next(); };
  const {tasksRouter,packRouter}=createFeaturePack({authenticate:auth});
  const app=express(); app.use(express.json()); app.use('/api/tasks',tasksRouter); app.use('/api/fp31c',packRouter);
  const srv=app.listen(0,'127.0.0.1'); await new Promise(r=>srv.once('listening',r));
  const base=`http://127.0.0.1:${srv.address().port}`;
  const call=async(p,o={})=>{ const r=await fetch(base+p,{headers:{'content-type':'application/json'},...o}); const t=await r.text(); let b; try{b=JSON.parse(t)}catch{b=t} return {status:r.status,body:b,headers:r.headers}; };
  try{
    // AI on empty records preserves 0/false/empty
    const emptyAi=await call(`/api/fp31c/ai/${FEATURES[0].key}`,{method:'POST',body:JSON.stringify({records:[]})});
    assert.equal(emptyAi.status,200); assert.equal(emptyAi.body.aiGenerated,false); assert.equal(emptyAi.body.sourceRecordCount,0); assert.deepEqual(emptyAi.body.sections.items.titles,[]); assert.equal(emptyAi.body.sections.overview.total,0);
    assert.equal((await call('/api/tasks',{method:'POST',body:JSON.stringify({description:'x'})})).status,400);
    const c=await call('/api/tasks',{method:'POST',body:JSON.stringify({title:'Alpha report',description:'draft',priority:'high'})}); assert.equal(c.status,201);
    await call('/api/tasks',{method:'POST',body:JSON.stringify({title:'Beta other'})});
    const filtered=await call('/api/tasks?search=alpha&priority=high'); assert.equal(filtered.body.total,1); assert.equal(filtered.body.data[0].title,'Alpha report');
    const upd=await call(`/api/tasks/${c.body.id}`,{method:'PUT',body:JSON.stringify({description:'',status:'done'})}); assert.equal(upd.status,200); assert.equal(upd.body.description,''); assert.equal(upd.body.status,'done');
    assert.equal((await call('/api/tasks/nope',{method:'PUT',body:JSON.stringify({status:'done'})})).status,404);
    const csv=await call('/api/fp31c/export?format=csv'); assert.match(String(csv.body),/Alpha report/); assert.equal(csv.headers.get('content-type').includes('text/csv'),true);
    const json=await call('/api/fp31c/export?format=json'); assert.equal(json.body.total,2);
    assert.equal((await call('/api/fp31c/export?format=xml')).status,400);
    const ai=await call(`/api/fp31c/ai/${FEATURES[1].key}`,{method:'POST',body:JSON.stringify({})}); assert.equal(ai.body.aiGenerated,false); assert.equal(ai.body.provider,'deterministic-fallback'); assert.ok(ai.body.sections.overview.label);
    assert.equal((await call('/api/fp31c/ai/unknown',{method:'POST',body:'{}'})).status,404);
  } finally { await new Promise(r=>srv.close(r)); }
});
