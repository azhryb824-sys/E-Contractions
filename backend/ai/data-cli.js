'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, 'data');
const REAL = path.join(ROOT, 'projects', 'real-projects.jsonl');
const APPROVED = path.join(ROOT, 'projects', 'approved-real-projects.jsonl');
const SPLITS = path.join(ROOT, 'splits');
const META = path.join(ROOT, 'metadata');
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const readJsonl = file => fs.existsSync(file) ? fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch(e){throw new Error(`${file}:${i+1}: ${e.message}`)}}) : [];
const writeJsonl = (file, rows) => { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file, rows.map(x=>JSON.stringify(x)).join('\n')+(rows.length?'\n':'')); };
function anonymize(row) {
  const out = JSON.parse(JSON.stringify(row));
  for (const key of ['client_name','client_phone','client_email','customer_name','phone','email','address']) delete out[key];
  out.client_project_group = out.client_project_group ? hash(out.client_project_group).slice(0,16) : undefined;
  out.source_document_hash = out.source_document_hash || hash(JSON.stringify(out.source_document || out.description || out.project_id));
  delete out.source_document;
  return out;
}
function validate(row) {
  const errors=[];
  if (!row.project_id) errors.push('project_id');
  if (!row.building_type) errors.push('building_type');
  if (!row.scope) errors.push('scope');
  if (!['real','seed','synthetic'].includes(row.data_source)) errors.push('data_source');
  if (row.data_source==='real' && row.engineer_approved!==true) errors.push('engineer_approved');
  if (!Array.isArray(row.items)) errors.push('items');
  return errors;
}
function importData(input) {
  if (!input) throw new Error('Usage: node ai/data-cli.js import <json|jsonl>');
  const ext=path.extname(input).toLowerCase(); const raw=fs.readFileSync(input,'utf8');
  const rows=ext==='.jsonl'?raw.split(/\r?\n/).filter(Boolean).map(JSON.parse):(Array.isArray(JSON.parse(raw))?JSON.parse(raw):[JSON.parse(raw)]);
  const existing=readJsonl(REAL); const imported=rows.map(r=>({...anonymize(r),data_source:'real',imported_at:new Date().toISOString()}));
  writeJsonl(REAL,[...existing,...imported]); console.log(JSON.stringify({imported:imported.length,total:existing.length+imported.length}));
}
function validateData() {
  const rows=readJsonl(REAL); const report=rows.map(r=>({project_id:r.project_id,errors:validate(r)}));
  const approved=rows.filter((r,i)=>report[i].errors.length===0); writeJsonl(APPROVED,approved);
  fs.mkdirSync(META,{recursive:true}); fs.writeFileSync(path.join(META,'real-data-validation.json'),JSON.stringify({generated_at:new Date().toISOString(),total:rows.length,approved:approved.length,rejected:rows.length-approved.length,records:report},null,2));
  console.log(JSON.stringify({total:rows.length,approved:approved.length,rejected:rows.length-approved.length})); if(rows.length-approved.length) process.exitCode=1;
}
function deduplicate() {
  const rows=readJsonl(REAL), seen=new Set(), unique=[]; for(const r of rows){const key=r.source_document_hash||hash(JSON.stringify([r.project_id,r.description,r.items]));if(!seen.has(key)){seen.add(key);unique.push(r)}}
  writeJsonl(REAL,unique); console.log(JSON.stringify({before:rows.length,after:unique.length,removed:rows.length-unique.length}));
}
function split() {
  const rows=readJsonl(APPROVED), buckets={train:[],validation:[],test:[],final_holdout:[]};
  for(const r of rows){const key=r.project_template_id||r.source_document_hash||r.client_project_group||r.project_id;const n=parseInt(hash(key).slice(0,8),16)%100;const target=n<70?'train':n<85?'validation':n<95?'test':'final_holdout';buckets[target].push(r)}
  fs.mkdirSync(SPLITS,{recursive:true}); for(const [name,data] of Object.entries(buckets))writeJsonl(path.join(SPLITS,`${name}.jsonl`),data);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length]))));
}
function qualityReport() {
  const files={real:REAL,approved:APPROVED,seed:path.join(ROOT,'projects','seed-projects.json'),synthetic:path.join(ROOT,'projects','synthetic-projects.jsonl')};
  const counts={}; for(const [k,f] of Object.entries(files)){if(!fs.existsSync(f)){counts[k]=0;continue}if(path.extname(f)==='.jsonl')counts[k]=readJsonl(f).length;else{const j=JSON.parse(fs.readFileSync(f,'utf8'));counts[k]=Array.isArray(j)?j.length:(j.projects||[]).length}}
  const approved=readJsonl(APPROVED), byBuilding={}; for(const r of approved)byBuilding[r.building_type]=(byBuilding[r.building_type]||0)+1;
  const report={generated_at:new Date().toISOString(),counts,approved_by_building_type:byBuilding,production_quantity_training_records:approved.filter(r=>r.engineer_approved===true).length,limitations:counts.approved===0?['لا توجد مشاريع حقيقية معتمدة؛ لا يجوز الادعاء بدقة إنتاجية للكميات']:[]};
  fs.mkdirSync(META,{recursive:true});fs.writeFileSync(path.join(META,'pipeline-quality-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
function generate(kind){const types=['apartment','villa','residential_building','office','shop','restaurant','cafe','clinic','school','hotel','warehouse','factory','mosque','mixed_use_building'];const rows=types.flatMap(type=>kind==='negative'?[{building_type:type,label:'forbidden',text:`لا تضف بنداً غير مناسب إلى ${type}`,data_source:'synthetic'}]:[{building_type:type,text:`مشروع ${type} جديد`,data_source:'synthetic'},{building_type:type,text:`تشطيب وتجديد ${type}`,data_source:'synthetic'}]);writeJsonl(path.join(ROOT,'training',kind==='negative'?'generated-negative-examples.jsonl':'generated-language-examples.jsonl'),rows);console.log(JSON.stringify({generated:rows.length,kind}));}
const [cmd,arg]=process.argv.slice(2);({import:()=>importData(arg),anonymize:()=>{const r=readJsonl(REAL).map(anonymize);writeJsonl(REAL,r);console.log(JSON.stringify({anonymized:r.length}))},validate:validateData,deduplicate,split,'quality-report':qualityReport,'generate-language':()=>generate('language'),'generate-negative':()=>generate('negative')}[cmd]||(()=>{throw new Error(`Unknown command: ${cmd}`)}))();
