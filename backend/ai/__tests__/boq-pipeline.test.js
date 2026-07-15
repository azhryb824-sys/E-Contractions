const assert = require('assert');
const { runBoqPipeline } = require('../boq-pipeline');
const sections = [{ code:'S', name:'S', items:[
  {code:'ELC-019',name_ar:'مصعد',quantity:1,classification:'required',quantity_driver:'fixed_per_project'},
  {code:'FLR-004',name_ar:'بورسلان',quantity:100,classification:'required',quantity_driver:'usable_area'},
  {code:'FLR-010',name_ar:'فينيل',quantity:100,classification:'required',quantity_driver:'usable_area'},
  {code:'ELC-008',name_ar:'قواطع',quantity:8,classification:'required',quantity_driver:'engineering_formula',requires_engineering_calculation:true}
]}];
const result = runBoqPipeline(sections,{building_type:'apartment',usable_area:100},{selected_alternatives:['FLR-004']});
assert(!result.approvedBoq.some(x=>x.code==='ELC-019'));
assert(!result.approvedBoq.some(x=>x.code==='ELC-008'));
assert(result.approvedBoq.some(x=>x.code==='FLR-004'));
assert(!result.approvedBoq.some(x=>x.code==='FLR-010'));
assert.equal(result.exclusiveConflicts.length,0);
console.log('boq-pipeline: 5 assertions passed');
