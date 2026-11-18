// Read-only readiness audit. Never fill missing values or modify business data/cache.
const fs=require('node:fs'),path=require('node:path');
const {prisma}=require('../src/config/prisma.ts');
const {Prisma}=require('../src/generated/prisma/client.ts');
const C=require('../src/services/matching/v3/config.ts');
const {loadDataset}=require('../src/services/matching/v3/squad.service.ts');
const {eligibility,scoreVector}=require('../src/services/matching/v3/performance.ts');
const {inspectInputs}=require('../src/services/matching/v3/input-readiness.ts');
const {injuryScore,priceScore,resaleAge}=require('../src/services/matching/v3/risk.ts');
const {verifiedFreeAgent}=require('../src/services/matching/v3/financial.ts');
const {evaluationDay}=require('../src/services/matching/v3/engine.ts');
const {playerAge,shiftCalendarMonths}=require('../src/services/matching/matching-scoring.service.ts');
const group=rows=>{const m=new Map();for(const r of rows){const v=m.get(r.playerId)||[];v.push(r);m.set(r.playerId,v)}return m};
async function audit(season){
 return prisma.$transaction(async tx=>{
  // Enforce read-only at PostgreSQL level as well as by code review.
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const started=performance.now(),now=new Date(),day=evaluationDay(now),config=C.builtinConfig();
  const prototype=await loadDataset(tx,season,config,'PROTOTYPE'),observed=await loadDataset(tx,season,config,'OBSERVED_ONLY');
  const candidates=prototype.candidates.filter(c=>c.inScope),ids=candidates.map(c=>c.row.playerId);
  const contracts=group(await tx.contract.findMany({where:{playerId:{in:ids},status:'ACTIVE',startDate:{lte:day},endDate:{gte:day}}}));
  const verification=new Map((await tx.playerDataVerification.findMany({where:{playerId:{in:ids}}})).map(r=>[r.playerId,r]));
  const injuries=group(await tx.injuryHistory.findMany({where:{playerId:{in:ids},startDate:{lte:day}}}));
  const start=new Date(shiftCalendarMonths(day,-24).getTime()-config.settings.valuationMaxAgeDays*86400000);
  const valuations=group(await tx.playerMarketValueHistory.findMany({where:{playerId:{in:ids},valuedAt:{gte:start,lte:day},recordedAt:{lte:now}}}));
  const quoteRows=await tx.matchingInput.findMany({where:{playerId:{in:ids}},select:{playerId:true,requirementId:true,estimatedFee:true,expectedSalaryPerYear:true}});
  const coverage={uniqueActiveContract:0,overlappingActiveContracts:0,verifiedFreeAgentToday:0,completeInjuryHistory24Months:0,usablePriceSeries24Months:0,ambiguousPriceSource:0,resaleAgeKnown:0,
   quotePairsWithFee:quoteRows.filter(r=>r.estimatedFee!==null).length,quotePairsWithWage:quoteRows.filter(r=>r.expectedSalaryPerYear!==null).length,quotePairsWithBoth:quoteRows.filter(r=>r.estimatedFee!==null&&r.expectedSalaryPerYear!==null).length};
  for(const c of candidates){const id=c.row.playerId,v=verification.get(id)||null,active=contracts.get(id)||[];
   if(active.length===1)coverage.uniqueActiveContract++;if(active.length>1)coverage.overlappingActiveContracts++;
   if(verifiedFreeAgent(v,active.length>0,day,now))coverage.verifiedFreeAgentToday++;
   if(injuryScore(injuries.get(id)||[],v,day,now,config.settings,false).score!==null)coverage.completeInjuryHistory24Months++;
   const price=priceScore(valuations.get(id)||[],day,now,config.settings);if(price.score!==null)coverage.usablePriceSeries24Months++;if(price.missing.includes('valuationSourceAmbiguous'))coverage.ambiguousPriceSource++;
   const age=playerAge(c.row.player.dateOfBirth,day);if(age!==null&&Number.isFinite(resaleAge(age+3)))coverage.resaleAgeKnown++;
  }
  const modes={};
  for(const[mode,data]of [['PROTOTYPE',prototype],['OBSERVED_ONLY',observed]]){
   const perRole=Object.fromEntries(C.roles.map(r=>[r.id,{group:r.group,eligible:0,scorable:0,passesDefaultFilters:0,usesEstimatedMetrics:0,usesEstimatedReference:0}]));
   let primaryRoleScorablePlayers=0,passesDefaultFiltersPlayers=0;
   const missing={};
   for(const c of data.candidates.filter(c=>c.inScope)){
    const vector=scoreVector(c,data.reference,config.settings);let scorable=false,passes=false;
    for(const r of vector.roles){if(!eligibility(c,r.group,false).eligible)continue;const d=perRole[r.roleId];d.eligible++;
     if(r.score!==null){d.scorable++;scorable=true;if(r.estimatedWeight>0)d.usesEstimatedMetrics++;
      if(Object.entries(r.weights).some(([key,w])=>w>0&&vector.metricsByGroup[r.group][key]?.referenceEstimated>0))d.usesEstimatedReference++;
      if(c.row.minutesPlayed>=C.defaultOptions.minMinutes&&r.score>=C.defaultOptions.minimumRoleScore){d.passesDefaultFilters++;passes=true;}
     }else for(const m of r.missing){const reason=`${r.roleId}.${m.metric}:${m.reason}`;missing[reason]=(missing[reason]||0)+1;}
    }
    if(scorable)primaryRoleScorablePlayers++;if(passes)passesDefaultFiltersPlayers++;
   }
   modes[mode]={referenceCount:data.reference.count,primaryRoleScorablePlayers,passesDefaultFiltersPlayers,perRole,
    missingRoleMetricOccurrences:Object.entries(missing).sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count})),
    referenceByGroup:Object.fromEntries(Object.entries(data.reference.groups).map(([g,metrics])=>[g,Object.fromEntries(Object.entries(metrics).map(([k,d])=>[k,{count:d.values.length,estimatedCount:d.estimated}]))]))};
  }
  const inventory=inspectInputs(prototype.candidates.map(c=>c.row),season);
  return{engineVersion:C.ENGINE_VERSION,matrixVersion:C.matrixVersion,implementationStage:C.IMPLEMENTATION_STAGE,generatedAt:now.toISOString(),evaluatedOn:day.toISOString().slice(0,10),season,
   readOnly:true,config:{source:'BUILTIN_V3',hash:config.hash,settings:config.settings,options:C.defaultOptions},datasetHash:prototype.datasetHash,
   totals:inventory.totals,inScopePlayers:candidates.length,leagues:inventory.leagues,statuses:inventory.statuses,inputIssues:inventory.issues,
   metrics:inventory.byMetric,coverage,modes,elapsedMs:Math.round(performance.now()-started),
   validation:{formulaRegression:'Run npm run test:matching-v3:all; this audit alone does not certify tests.',scoutingAccuracy:'NOT_VALIDATED_AGAINST_INDEPENDENT_SCOUT_LABELS',loadCapacity:'NOT_A_CONCURRENT_LOAD_TEST',fullMatchingReadiness:'REQUIRES_A_SPECIFIC_REQUIREMENT_AND_ITS_QUOTES'},
   notes:['Các chỉ tiêu tài chính/y tế tính theo cầu thủ trong cohort; quotePairs tính theo cặp nhu cầu/cầu thủ, không phải người duy nhất.',
    'Độ phủ vai trò chỉ xét nhóm chính và không bật chuyển vị trí; đủ S không đồng nghĩa đủ F/R hoặc qua bộ lọc phí/lương.',
    'Số lượng giải có thể trùng cầu thủ trong mùa; không cộng thành tổng người duy nhất.',
    'Ước tính trong candidate và tập tham chiếu được tách; không gọi PROTOTYPE là dữ liệu đo đã xác minh.',
    'Audit dùng cấu hình V3 mặc định, không cấu hình active tùy chỉnh; không ghi cache, seed, cấu hình hoặc MatchResult.']};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:120000});
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==0&&(args.length!==2||args[0]!=='--season'))throw new Error('Usage: npm run matching:v3:audit -- [--season 2025/2026]');
 const season=args[1]||'2025/2026';if(!/^\d{4}\/\d{4}$/.test(season)||+season.slice(5)!==+season.slice(0,4)+1||new Date(`${season.slice(5)}-07-01T00:00:00Z`)>new Date())throw new Error('Mùa phải liên tiếp và đã kết thúc.');
 const report=await audit(season),dest=path.resolve(__dirname,'../data/v3-metrics/stage-4-readiness.json');
 fs.mkdirSync(path.dirname(dest),{recursive:true});const temporary=dest+'.tmp';fs.writeFileSync(temporary,JSON.stringify(report,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,dest);
 console.log(JSON.stringify({report:dest,engineVersion:report.engineVersion,inScopePlayers:report.inScopePlayers,statuses:report.statuses,coverage:report.coverage,modes:Object.fromEntries(Object.entries(report.modes).map(([k,m])=>[k,{referenceCount:m.referenceCount,primaryRoleScorablePlayers:m.primaryRoleScorablePlayers,passesDefaultFiltersPlayers:m.passesDefaultFiltersPlayers}])),elapsedMs:report.elapsedMs},null,2));
 if(report.inputIssues.length){console.error(`${report.inputIssues.length} input issue(s); xem report.`);process.exitCode=1;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
module.exports={audit};
