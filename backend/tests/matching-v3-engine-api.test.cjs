const assert=require('node:assert/strict'),app=require('../src/app.ts').default;
const {prisma}=require('../src/config/prisma.ts'),{createUser}=require('../src/services/user.service.ts');
const C=require('../src/services/matching/v3/config.ts'),{metricsInput,metricInputHash}=require('../src/services/player-metrics-input.ts');
const {shiftCalendarMonths:shift}=require('../src/services/matching/v3/dates.ts');
const {evaluationDay}=require('../src/services/matching/v3/engine.ts');
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`,users=[],players=[],configs=[],tag=Date.now(),season='2022/2023',day=evaluationDay(new Date());let club;
 const activeBefore=await prisma.scoringConfig.findFirst({where:{isActive:true}});
 const call=async(status,method,path,body,token)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.text();assert.equal(r.status,status,`${path}: ${raw.slice(0,1200)}`);return raw?JSON.parse(raw).data:null};
 const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a}!=${b}`);
 try{
  for(const [i,role]of ['ADMIN','SCOUT','SCOUT'].entries())users.push(await createUser({username:`engine_v3_${i}_${tag}`,email:`engine_v3_${i}_${tag}@example.com`,password:'FixtureV3Engine123',role}));
  const tokens=[];for(const u of users)tokens.push((await call(200,'POST','/auth/login',{email:u.email,password:'FixtureV3Engine123'})).accessToken);const[admin,a,b]=tokens;
  const template=await call(200,'GET','/matching/v3/template',undefined,a);assert.equal(template.scoringAvailable,true);
  await call(401,'GET','/matching/v3/openapi');
  const specResponse=await fetch(base+'/matching/v3/openapi',{headers:{Authorization:'Bearer '+a}});assert.equal(specResponse.status,200);assert.equal(specResponse.headers.get('cache-control'),'no-store');
  const spec=await specResponse.json();assert.equal(spec.openapi,'3.0.3');assert.equal(spec['x-engine-version'],template.engineVersion);assert.equal(spec.components.schemas.Evaluation.properties.implementationStage.enum[0],template.implementationStage);
  assert.deepEqual(spec.components.schemas.EvaluateRequest.properties.roleIds.items.enum,template.roles.map(r=>r.id));
  const cfg=structuredClone(template.config);cfg.name='V3 engine fixture '+tag;cfg.parameters.settings.minimumReferencePlayers=1;
  const config=await call(201,'POST','/scoring-configs',cfg,admin);configs.push(config.id);
  club=await prisma.club.create({data:{name:'V3 TEST club',country:'TEST',league:'TEST',foundedYear:2000}});
  const req=await prisma.clubRequirement.create({data:{clubId:club.id,userId:users[1].id,position:'ST',minAge:18,maxAge:30,budget:60,salaryLimit:10,priority:1}});
  for(let i=0;i<4;i++){
   const p=await prisma.player.create({data:{name:`V3 TEST candidate ${i}`,...(i<3?{transfermarktId:1700000000+(tag%1000000)+i}:{}),dateOfBirth:shift(day,-300),nationality:'TEST',position:'ST',height:180,marketValue:20,preferredFoot:'RIGHT'}});players.push(p);
   if(i===3)continue;
   const stats=await prisma.playerStats.create({data:{playerId:p.id,season,minutesPlayed:2000,appearances:25,goals:10+i,assists:5,tacklesWon:20,interceptions:10,keyPasses:30,passesCompleted:1000,passesAttempted:1200,yellowCards:0,redCards:0}});
   const values=Object.fromEntries(C.inputMetrics.outfield.map(k=>[k,{value:C.percentageMetrics.has(k)?50:1+i,unit:C.percentageMetrics.has(k)?'PERCENT':'PER_90',status:'DERIVED',basis:'TEST',...(C.ratioMetrics.has(k)?{successes:5,attempts:10}:{})}]));
   await prisma.playerStatsMetrics.create({data:{statsId:stats.id,method:'TEST',inputHash:metricInputHash(metricsInput(p,stats,null)),sourceHash:'a'.repeat(64),values,evidence:{leagues:['Premier League']}}});
   await prisma.matchingInput.create({data:{playerId:p.id,requirementId:req.id,userId:users[1].id,estimatedFee:30,expectedSalaryPerYear:5,feeSource:'TEST QUOTE',salarySource:'TEST QUOTE'}});
   await prisma.contract.create({data:{playerId:p.id,clubId:club.id,startDate:shift(day,-12),endDate:shift(day,36),salaryPerYear:99,status:'ACTIVE'}});
   await prisma.playerDataVerification.create({data:{playerId:p.id,injuryCoveredFrom:shift(day,-24),injuryCoveredThrough:day,injuryVerifiedAt:new Date(),injuryVerifiedById:users[0].id,injurySource:'TEST COMPLETE COVERAGE'}});
   await prisma.playerMarketValueHistory.createMany({data:[-24,-18,-12,-6,0].map(m=>({playerId:p.id,valuedAt:shift(day,m),marketValue:20,source:'TEST PRICES',reliability:'OFFICIAL'}))});
  }
  const body={playerId:players[2].id,requirementId:req.id,season,roleIds:['POACHER'],configId:config.id,options:{minMinutes:0,minimumRoleScore:0},strategy:'BALANCED'};
  await call(401,'POST','/matching/v3/evaluate',body);await call(409,'POST','/matching/v3/evaluate',body,a);
  // V1 runtime is gone; legacy data cannot displace the single V3 active config.
  for(const[method,path]of [['GET','/matching/template'],['POST','/matching/evaluate'],['POST','/matching/rank'],['POST','/matching/search'],['POST','/matching/financial/preview'],['POST','/matching/financial/evaluate'],['POST','/matching/squad/preview'],['GET','/matching/risk/demo'],['POST','/matching/risk/evaluate'],['POST','/matching/risk/preview']]){
   const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+a,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});assert.equal(r.status,404,path);
  }
  await call(409,'POST','/scoring-configs',{...cfg,name:'Rejected legacy '+tag,parameters:{engineVersion:'matching-v1'}},admin);
  await call(409,'POST','/scoring-configs',{...cfg,name:'Rejected unversioned '+tag,parameters:{}},admin);
  const legacy=await prisma.scoringConfig.create({data:{...cfg,name:'TEST historical config '+tag,parameters:{engineVersion:'matching-v1'}}});configs.push(legacy.id);
  const archived=await prisma.matchResult.create({data:{userId:users[1].id,playerId:players[1].id,requirementId:req.id,configId:legacy.id,totalScore:80,financialScore:80,squadScore:80,riskScore:80,criteriaScores:{historical:true},prosCons:{},inputSnapshot:{engineVersion:'matching-v1',historical:true}}});
  const archive=await call(200,'GET',`/match-results/${archived.id}`,undefined,a);assert.equal(archive.inputSnapshot.engineVersion,'matching-v1');assert.equal(archive.totalScore,'80');
  await call(404,'GET',`/match-results/${archived.id}`,undefined,b);
  await call(409,'POST',`/scoring-configs/${legacy.id}/activate`,undefined,admin);
  assert.equal((await prisma.scoringConfig.findFirst({where:{isActive:true}})).id,activeBefore.id);
  assert.equal((await call(200,'GET',`/match-results/${archived.id}`,undefined,a)).totalScore,archive.totalScore);
  await call(404,'GET',`/scoring-configs/${legacy.id}`,undefined,admin);
  assert(!(await call(200,'GET','/scoring-configs?pageSize=100',undefined,admin)).some(c=>c.id===legacy.id));
  await assert.rejects(prisma.$transaction(async tx=>{
   await tx.scoringConfig.updateMany({where:{isActive:true},data:{isActive:false}});
   await tx.scoringConfig.update({where:{id:legacy.id},data:{isActive:true}});
  }),e=>String(e.message).includes('scoring_configs_active_v3_only'));
  await prisma.scoringConfig.updateMany({where:{isActive:true},data:{isActive:false}});
  await call(409,'POST','/matching/v3/evaluate',{...body,configId:undefined,save:true},a);
  await call(409,'POST','/matching/v3/evaluate',{...body,configId:undefined,save:true},admin);
  await prisma.scoringConfig.update({where:{id:activeBefore.id},data:{isActive:true}});
  const first=await call(200,'POST','/matching/v3/evaluate',body,admin);assert(first.complete);near(first.precision.financial,81.05);near(first.precision.risk,88);assert(first.criteria.squad.chosen.roleId==='POACHER');assert(!first.saved);
  for(const strategy of Object.keys(C.strategies)){
   const d=await call(200,'POST','/matching/v3/evaluate',{...body,strategy},admin);near(d.precision.financial,first.precision.financial);near(d.precision.squad,first.precision.squad);near(d.precision.risk,first.precision.risk);
   const w=C.strategies[strategy];near(d.precision.total,w.financial*d.precision.financial+w.squad*d.precision.squad+w.risk*d.precision.risk);
  }
  for(const patch of [{strategy:'BAD'},{roleIds:['BAD']},{pillarWeights:{financial:0,squad:0,risk:0}},{strategy:'BALANCED',pillarWeights:{financial:1,squad:0,risk:0}},{save:'yes'},{options:{bad:1}}])await call(400,'POST','/matching/v3/evaluate',{...body,...patch},admin);
  await call(200,'POST',`/scoring-configs/${config.id}/activate`,undefined,admin);
  await call(404,'POST','/matching/v3/evaluate',body,b);
  const saved=await call(200,'POST','/matching/v3/evaluate',{...body,configId:undefined,save:true},a);assert(saved.saved);assert(saved.resultId);
  const history=await call(200,'GET',`/match-results/${saved.resultId}`,undefined,a);assert.equal(history.configId,config.id);assert.equal(history.inputSnapshot.engineVersion,'matching-v3.0.0');near(history.inputSnapshot.weights.squad,.5);
  await call(404,'GET',`/match-results/${saved.resultId}`,undefined,b);
  await call(409,'PATCH',`/scoring-configs/${config.id}`,{parameters:cfg.parameters},admin);
  const{playerId, ...common}=body;
  const rank=await call(200,'POST','/matching/v3/rank',{...common,playerIds:players.slice(0,3).map(p=>p.id),pageSize:1},a);assert.equal(rank.meta.rankedCount,3);assert.equal(rank.ranked[0].player.id,players[2].id);
  const search=await call(200,'POST','/matching/v3/search',{...common,pageSize:1},a);assert.equal(search.meta.rankedCount,3);near(search.ranked[0].precision.total,rank.ranked[0].precision.total);assert.equal(search.meta.totalCandidates,3);
  await call(404,'POST','/matching/v3/search',common,b);
  const quoteWhere={requirementId_playerId:{requirementId:req.id,playerId:players[2].id}};
  await prisma.matchingInput.update({where:quoteWhere,data:{estimatedFee:72,expectedSalaryPerYear:15}});
  const edge=await call(200,'POST','/matching/v3/evaluate',{...body,options:{...body.options,feeTolerance:.2,wageTolerance:.5}},a);assert(edge.complete);near(edge.criteria.financial.scores.fee,0);near(edge.criteria.financial.scores.salary,0);
  await prisma.matchingInput.update({where:quoteWhere,data:{estimatedFee:72.01}});
  const excluded=await call(200,'POST','/matching/v3/evaluate',{...body,save:true,options:{...body.options,feeTolerance:.2,wageTolerance:.5}},a);assert.equal(excluded.status,'EXCLUDED');assert(excluded.excluded.includes('feeAboveTolerance'));assert(!excluded.saved);
  await prisma.matchingInput.update({where:quoteWhere,data:{estimatedFee:30,expectedSalaryPerYear:5}});
  const frozen=await call(200,'GET',`/match-results/${saved.resultId}`,undefined,a);assert.equal(frozen.inputSnapshot.quote.estimatedFee,'30');near(Number(frozen.totalScore),saved.totalScore);
  await prisma.playerDataVerification.delete({where:{playerId:players[2].id}});
  const partial=await call(200,'POST','/matching/v3/evaluate',{...body,save:true},a);assert.equal(partial.status,'INCOMPLETE');assert(partial.missing.includes('risk.injuryCoverage24Months'));assert(!partial.saved);
  const zero=await call(200,'POST','/matching/v3/evaluate',{...body,strategy:undefined,pillarWeights:{financial:30,squad:70,risk:0},save:true},a);assert(zero.complete);assert(zero.saved);assert.equal(zero.riskScore,null);
  const zeroHistory=await call(200,'GET',`/match-results/${zero.resultId}`,undefined,a);assert.equal(zeroHistory.riskScore,null);near(zeroHistory.inputSnapshot.weights.risk,0);
  const noStats=await call(200,'POST','/matching/v3/evaluate',{...body,playerId:players[3].id,save:true},a);assert.equal(noStats.status,'INCOMPLETE');assert(noStats.missing.includes('seasonStats'));
  const min=await call(200,'POST','/matching/v3/evaluate',{...body,options:{minMinutes:2100}},a);assert(min.excluded.includes('minutesBelowMinimum'));
  const age=await call(200,'POST','/matching/v3/evaluate',{...body,options:{...body.options,minimumAge:30}},a);assert(age.excluded.includes('ageOutsideRange'));
  assert.equal(await prisma.matchResult.count({where:{configId:config.id}}),2);
  // FE handoff flow: all user actions use HTTP, fixture football inputs stay TEST-only.
  const me=await call(200,'GET','/auth/me',undefined,a);assert.equal(me.id,users[1].id);
  const demand=await call(201,'POST','/club-requirements',{clubId:club.id,position:'ST',minAge:18,maxAge:30,budget:'60',salaryLimit:'10',priority:1},a);
  assert.equal(demand.userId,me.id);
  const quotation=await call(201,'POST','/matching-inputs',{playerId:players[1].id,requirementId:demand.id,estimatedFee:'30',expectedSalaryPerYear:'5',feeSource:'TEST FE quote',salarySource:'TEST FE wage'},a);
  const journey={...body,playerId:players[1].id,requirementId:demand.id,save:true};
  const evaluation=await call(200,'POST','/matching/v3/evaluate',journey,a);assert(evaluation.saved);
  for(const key of spec.components.schemas.Evaluation.required)assert(Object.hasOwn(evaluation,key),'missing public response field '+key);
  assert.equal(typeof evaluation.totalScore,'number');assert.equal(evaluation.status,'COMPLETE');
  const past=await call(200,'GET',`/match-results/${evaluation.resultId}`,undefined,a);assert.equal(typeof past.totalScore,'string');
  const list=await call(200,'GET',`/match-results?requirementId=${demand.id}`,undefined,a);assert.equal(list.length,1);
  const item=await call(201,'POST','/shortlists',{playerId:players[1].id,requirementId:demand.id,note:'TEST FE selected'},a);
  await call(409,'POST','/shortlists',{playerId:players[1].id,requirementId:demand.id},a);
  await call(404,'PATCH',`/shortlists/${item.id}`,{note:'other owner'},b);
  await call(200,'PATCH',`/shortlists/${item.id}`,{note:'TEST updated note',priority:2},a);
  assert((await call(200,'GET','/shortlists',undefined,a)).some(r=>r.id===item.id));
  await call(200,'PATCH',`/club-requirements/${demand.id}`,{budget:'20'},a);
  const recalculated=await call(200,'POST','/matching/v3/evaluate',journey,a);assert.equal(recalculated.status,'EXCLUDED');assert(recalculated.excluded.includes('feeAboveTolerance'));assert(!recalculated.saved);
  const kept=await call(200,'GET',`/match-results/${evaluation.resultId}`,undefined,a);assert.equal(kept.inputSnapshot.requirement.budget,'60');assert.equal(kept.totalScore,past.totalScore);
  await call(400,'PATCH',`/matching-inputs/${quotation.id}`,{estimatedFee:null,expectedSalaryPerYear:null},a);
  await call(200,'PATCH',`/club-requirements/${demand.id}`,{budget:'60'},a);
  await call(200,'PATCH',`/matching-inputs/${quotation.id}`,{expectedSalaryPerYear:null,salarySource:null},a);
  const unknown=await call(200,'POST','/matching/v3/evaluate',{...journey,options:{...journey.options,dataMode:'OBSERVED_ONLY'}},a);assert.equal(unknown.status,'INCOMPLETE');assert.equal(unknown.totalScore,null);assert(!unknown.saved);
  await call(204,'DELETE',`/shortlists/${item.id}`,undefined,a);
  const sourceQuote={requirementId_playerId:{requirementId:req.id,playerId:players[1].id}};
  await prisma.matchingInput.update({where:sourceQuote,data:{estimatedFee:null,feeSource:null}});
  await prisma.playerMarketValueHistory.updateMany({where:{playerId:players[1].id,valuedAt:day},data:{marketValue:0}});
  const moneyCase={...body,playerId:players[1].id,strategy:undefined,pillarWeights:{financial:30,squad:70,risk:0},save:false};
  const noPrice=await call(200,'POST','/matching/v3/evaluate',moneyCase,a);
  assert.equal(noPrice.precision.fee,null);assert(noPrice.missing.includes('feeForEligibility'));assert.equal(noPrice.criteria.financial.feeBasis,'UNKNOWN');
  await prisma.playerMarketValueHistory.updateMany({where:{playerId:players[1].id,valuedAt:day},data:{marketValue:'.2'}});
  await prisma.clubRequirement.update({where:{id:req.id},data:{budget:'.23'}});
  const decimalPrice=await call(200,'POST','/matching/v3/evaluate',moneyCase,a);assert(decimalPrice.complete);near(decimalPrice.precision.fee,.23);near(decimalPrice.criteria.financial.scores.fee,60);
  const noEstimate=await call(200,'POST','/matching/v3/evaluate',{...moneyCase,options:{...moneyCase.options,dataMode:'OBSERVED_ONLY'}},a);assert.equal(noEstimate.precision.fee,null);
  await prisma.clubRequirement.update({where:{id:req.id},data:{budget:60}});
  await prisma.playerMarketValueHistory.updateMany({where:{playerId:players[1].id,valuedAt:day},data:{marketValue:20}});
  await prisma.matchingInput.update({where:sourceQuote,data:{estimatedFee:30,feeSource:'TEST QUOTE'}});
  const{audit}=require('../scripts/audit-matching-v3.cjs');
  const writeCounts=async()=>[await prisma.matchResult.count(),await prisma.roleScoreSnapshot.count(),await prisma.scoringConfig.count(),await prisma.matchingInput.count(),await prisma.auditLog.count()];
  const prior=await writeCounts(),report=await audit(season);assert.equal(report.readOnly,true);assert.equal(report.inScopePlayers,3);assert.deepEqual(await writeCounts(),prior);
  await call(204,'POST','/auth/logout',undefined,a);await call(401,'GET','/auth/me',undefined,a);
  console.log('PASS: FE workflow login→requirement→quote→evaluate→history→shortlist,duplicate/ownership checks,recalculation preserves old history,missing data null,OpenAPI live contract,and read-only audit.');
  console.log('PASS: V3 F/R/total strategies,hard caps,role filters,ownership,rank/search consistency,immutable snapshots,audit config protection,missing vs excluded,and zero-weight NULL history.');
 }finally{
  const ids=players.map(p=>p.id),uids=users.map(u=>u.id);
  if(configs.length)await prisma.matchResult.deleteMany({where:{configId:{in:configs}}});if(uids.length)await prisma.auditLog.deleteMany({where:{actorId:{in:uids}}});
  if(configs.length)await prisma.scoringConfig.deleteMany({where:{id:{in:configs}}});if(activeBefore)await prisma.scoringConfig.update({where:{id:activeBefore.id},data:{isActive:true}});
  if(uids.length){await prisma.shortlistItem.deleteMany({where:{userId:{in:uids}}});await prisma.shortlist.deleteMany({where:{userId:{in:uids}}});}
  if(ids.length){await prisma.matchingInput.deleteMany({where:{playerId:{in:ids}}});await prisma.contract.deleteMany({where:{playerId:{in:ids}}});await prisma.playerDataVerification.deleteMany({where:{playerId:{in:ids}}});await prisma.playerMarketValueHistory.deleteMany({where:{playerId:{in:ids}}});await prisma.playerStats.deleteMany({where:{playerId:{in:ids}}});await prisma.player.deleteMany({where:{id:{in:ids}}});}
  if(uids.length){await prisma.clubRequirement.deleteMany({where:{userId:{in:uids}}});await prisma.user.deleteMany({where:{id:{in:uids}}});}if(club)await prisma.club.delete({where:{id:club.id}});
  await new Promise(r=>server.close(r));await prisma.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
