'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const approved = path.join(__dirname,'data','projects','approved-real-projects.jsonl');
const rows = fs.existsSync(approved) ? fs.readFileSync(approved,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
const invalid = rows.filter(r => r.data_source !== 'real' || r.engineer_approved !== true || !Array.isArray(r.items));
if (!rows.length || invalid.length) {
  console.error(JSON.stringify({status:'blocked',reason:'quantity_training_requires_approved_real_projects',approved_real_projects:rows.length,invalid_records:invalid.length}));
  process.exit(2);
}
const result = spawnSync(process.execPath,[path.join(__dirname,'train.js'),'--component','quantities','--dataset',approved],{stdio:'inherit'});
process.exit(result.status || 0);
