
'use strict';
const express = require('express');
const crypto = require('crypto');

const STATUSES = ['todo','in_progress','done'];
const PRIORITIES = ['low','medium','high'];

function ownerKey(req){ return String(req.user?.id ?? req.user?.userId ?? req.user?.sub ?? req.user?.email ?? 'anonymous'); }
function normRecord(r){ return { title:String(r?.title ?? r?.name ?? r?.case_name ?? r?.site_id ?? ''), description:String(r?.description ?? r?.content ?? r?.notes ?? ''), status:String(r?.status ?? ''), priority:String(r?.priority ?? r?.riskLevel ?? r?.risk_level ?? '') }; }
function escCsv(v){ const s=v===null||v===undefined?'':String(v); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }

const FEATURES = [
    {key:'repurpose-plan',label:'Repurpose plan',extra:(rs)=>({formatReadiness:{label:'Format readiness',withContent:rs.filter(r=>r.description.length>0).length,missingContent:rs.filter(r=>r.description.length===0).length}})},
    {key:'headline-scoring',label:'Headline scoring',extra:(rs)=>({headlines:{label:'Headlines',averageTitleLength:rs.length?Math.round(rs.reduce((a,r)=>a+r.title.length,0)/rs.length):0,emptyTitles:rs.filter(r=>!r.title).length}})},
    {key:'channel-fit',label:'Channel fit',extra:(rs)=>({channels:{label:'Channels',described:rs.filter(r=>r.description.length>0).length,undescribed:rs.filter(r=>r.description.length===0).length}})},
   ];

function createFeaturePack({ authenticate, getRecords } = {}){
  if(typeof authenticate!=='function') throw new Error('authenticate middleware required');
  const store = new Map();
  const listFor=(req)=>{ const k=ownerKey(req); if(!store.has(k)) store.set(k,[]); return store.get(k); };

  const tasks = express.Router();
  tasks.use(authenticate);
  tasks.get('/', (req,res)=>{
    const {search='', q='', status='', priority=''} = req.query;
    const term=String(search||q).toLowerCase();
    let rows=[...listFor(req)];
    if(term) rows=rows.filter(t=>`${t.title} ${t.description}`.toLowerCase().includes(term));
    if(status) rows=rows.filter(t=>t.status===status);
    if(priority) rows=rows.filter(t=>t.priority===priority);
    res.json({ data:rows, items:rows, total:rows.length, count:rows.length });
  });
  tasks.post('/', (req,res)=>{
    const b=req.body||{};
    if(!b.title || !String(b.title).trim()) return res.status(400).json({error:'title is required'});
    if(b.status!==undefined && !STATUSES.includes(b.status)) return res.status(400).json({error:'invalid status'});
    if(b.priority!==undefined && !PRIORITIES.includes(b.priority)) return res.status(400).json({error:'invalid priority'});
    const now=new Date().toISOString();
    const task={ id:crypto.randomUUID(), title:String(b.title), description:b.description!==undefined?String(b.description):'', status:b.status||'todo', priority:b.priority||'medium', dueDate:b.dueDate!==undefined?b.dueDate:null, tags:Array.isArray(b.tags)?b.tags:[], createdAt:now, updatedAt:now };
    listFor(req).unshift(task);
    res.status(201).json(task);
  });
  const update=(req,res)=>{
    const task=listFor(req).find(t=>t.id===req.params.id);
    if(!task) return res.status(404).json({error:'task not found'});
    const b=req.body||{};
    if('title' in b){ if(!String(b.title).trim()) return res.status(400).json({error:'title is required'}); task.title=String(b.title); }
    if('description' in b) task.description=String(b.description ?? '');
    if('status' in b){ if(!STATUSES.includes(b.status)) return res.status(400).json({error:'invalid status'}); task.status=b.status; }
    if('priority' in b){ if(!PRIORITIES.includes(b.priority)) return res.status(400).json({error:'invalid priority'}); task.priority=b.priority; }
    if('dueDate' in b) task.dueDate=b.dueDate;
    if('tags' in b) task.tags=Array.isArray(b.tags)?b.tags:[];
    task.updatedAt=new Date().toISOString();
    res.json(task);
  };
  tasks.put('/:id', update); tasks.patch('/:id', update);

  const pack = express.Router();
  pack.use(authenticate);
  pack.get('/export', (req,res)=>{
    const format=String(req.query.format||'json').toLowerCase();
    if(!['csv','json'].includes(format)) return res.status(400).json({error:'format must be csv or json'});
    const {search='', status='', priority=''} = req.query; const term=String(search).toLowerCase();
    let rows=[...listFor(req)];
    if(term) rows=rows.filter(t=>`${t.title} ${t.description}`.toLowerCase().includes(term));
    if(status) rows=rows.filter(t=>t.status===status);
    if(priority) rows=rows.filter(t=>t.priority===priority);
    if(format==='json') return res.json({ data:rows, total:rows.length });
    const cols=['id','title','description','status','priority','dueDate','createdAt','updatedAt'];
    const csv=[cols.join(','), ...rows.map(r=>cols.map(c=>escCsv(r[c])).join(','))].join('\n');
    res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition','attachment; filename="tasks.csv"'); return res.send(csv);
  });

  pack.post('/ai/:feature', async (req,res)=>{
    const feature=FEATURES.find(f=>f.key===req.params.feature);
    if(!feature) return res.status(404).json({error:'unknown feature', features:FEATURES.map(f=>f.key)});
    let raw=[];
    if(Array.isArray(req.body?.records)) raw=req.body.records;
    else if(typeof getRecords==='function'){ try{ raw=await getRecords(req)||[]; }catch{ raw=[]; } }
    if(!raw.length) raw=listFor(req);
    const records=raw.map(normRecord);
    const total=records.length;
    const completed=records.filter(r=>['done','completed','closed','active'].includes(r.status.toLowerCase())).length;
    const open=total-completed;
    const high=records.filter(r=>['high','critical'].includes(r.priority.toLowerCase())).length;
    let sections={
      overview:{ label:'Overview', total, open, completed },
      priorities:{ label:'Priorities', high, flagged:high>0 },
      items:{ label:'Items', titles:records.map(r=>r.title), empty:total===0 },
    };
    try{ const extra=feature.extra(records); if(extra) sections={...sections, ...extra}; }catch{ /* keep base sections */ }
    let aiGenerated=false, provider='deterministic-fallback', summary=`${feature.label}: analysed ${total} record(s); ${open} open, ${completed} completed/closed, ${high} high priority.`;
    const apiKey=process.env.OPENROUTER_API_KEY||process.env.OPENAI_API_KEY;
    if(apiKey){
      try{
        const isOpenAI=!process.env.OPENROUTER_API_KEY && !!process.env.OPENAI_API_KEY;
        const url=isOpenAI?'https://api.openai.com/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';
        const model=isOpenAI?(process.env.OPENAI_MODEL||'gpt-4o-mini'):(process.env.OPENROUTER_MODEL||'anthropic/claude-haiku-4.5');
        const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),8000);
        const resp=await fetch(url,{method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'system',content:'Summarise the records in 2 sentences.'},{role:'user',content:JSON.stringify(records).slice(0,4000)}]})});
        clearTimeout(timer);
        if(!resp.ok) throw new Error('provider error');
        const data=await resp.json(); const text=data?.choices?.[0]?.message?.content;
        if(text){ summary=String(text); aiGenerated=true; provider=isOpenAI?'openai':'openrouter'; }
      }catch{ aiGenerated=false; provider='deterministic-fallback'; }
    }
    res.json({ feature:feature.key, label:feature.label, aiGenerated, provider, sourceRecordCount:total, summary, sections });
  });
  pack.get('/ai/features', (req,res)=>res.json({ features:FEATURES.map(f=>({key:f.key,label:f.label})) }));
  return { tasksRouter:tasks, packRouter:pack, store };
}
module.exports={ createFeaturePack, FEATURES };
