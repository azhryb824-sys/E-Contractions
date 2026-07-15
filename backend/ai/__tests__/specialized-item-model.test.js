const assert = require('assert');
const predictor = require('../specialized/item-predictor');
const cases = [
  ['تشطيب شقة اقتصادية ثلاث غرف وحمامين بتكييف سبليت',{building_type:'apartment',project_condition:'existing_building_fitout',scope:'full_fitout',ownership_scope:'single_unit_only',finish_level:'economic'},['ELV-001','FAC-004']],
  ['تجديد كهرباء وسباكة شقة قديمة دون تغيير بقية التشطيبات',{building_type:'apartment',project_condition:'renovation',scope:'renovation',ownership_scope:'single_unit_only'},['EXC-001','ELV-001']],
  ['فيلا دورين من العظم إلى التسليم',{building_type:'villa',project_condition:'shell_and_core',scope:'full_fitout'},['EXC-001','CON-002']],
  ['إنشاء عمارة ستة أدوار بكل دور ثلاث شقق',{building_type:'residential_building',project_condition:'new_construction',scope:'full_construction'},[]],
  ['مكتب محاماة عشرون موظفاً وغرفة اجتماعات',{building_type:'office',project_condition:'existing_building_fitout',scope:'full_fitout'},['WOD-005','ELV-001']],
  ['محل عطور بواجهة زجاجية دون مستودع',{building_type:'shop',project_condition:'existing_building_fitout',scope:'full_fitout'},['GAS-001','HVAC-012']],
  ['مطعم برجر بمطبخ غاز وشفاطات',{building_type:'restaurant',project_condition:'existing_building_fitout',scope:'full_fitout'},[]],
  ['كافيه قهوة فقط دون طبخ',{building_type:'cafe',project_condition:'existing_building_fitout',scope:'full_fitout'},['GAS-001','HVAC-012','FIR-011']],
  ['عيادة جلدية ثلاث غرف كشف دون أشعة',{building_type:'clinic',project_condition:'existing_building_fitout',scope:'full_fitout'},['MED-002']],
  ['مدرسة اثنا عشر فصلاً',{building_type:'school',project_condition:'new_construction',scope:'full_construction'},[]],
  ['فندق أربعون غرفة دون مطعم',{building_type:'hotel',project_condition:'new_construction',scope:'full_construction'},[]],
  ['مستودع أثاث بدون تبريد',{building_type:'warehouse',project_condition:'new_construction',scope:'full_construction'},['HVAC-015']],
  ['مخزن تجميد أغذية',{building_type:'cold_storage',project_condition:'existing_building_fitout',scope:'full_fitout'},['HVAC-001']],
  ['ورشة سيارات بها شفط عوادم وهواء مضغوط',{building_type:'factory',project_condition:'existing_building_fitout',scope:'full_fitout'},[]],
  ['مسجد يسع خمسمئة مصل',{building_type:'mosque',project_condition:'new_construction',scope:'full_construction'},[]],
  ['مبنى محلات في الأرضي وشقق في الأدوار العليا',{building_type:'mixed_use_building',project_condition:'new_construction',scope:'full_construction'},[]]
];
let predicted=0;
for (const [description,project,forbidden] of cases) {
  const result=predictor.predict({description,...project},project); assert(result&&result.items.length,`no predictions: ${description}`);
  const map=new Map(result.items.map(x=>[x.item_code,x]));
  for(const code of forbidden)assert(map.get(code)?.classification!=='core',`${code} must not be core: ${description}`);
  for(const item of result.items.filter(x=>x.classification==='core')){assert(item.reason,'core item needs reason');assert(Array.isArray(item.evidence_from_description),'core item needs evidence array');predicted++;}
}
console.log(JSON.stringify({cases:cases.length,core_predictions_checked:predicted,model:predictor.load().model_version}));
