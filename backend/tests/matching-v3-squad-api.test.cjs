const assert=require('node:assert/strict'),app=require('../src/app.ts').default;
const {prisma}=require('../src/config/prisma.ts'),{createUser}=require('../src/services/user.service.ts');
const C=require('../src/services/matching/v3/config.ts'),{metricsInput,metricInputHash}=require('../src/services/player-metrics-input.ts');
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`,users=[],players=[],configs=[],tag=Date.now(),season='2023/2024';
 const call=async(status,method,path,body,token)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.text();assert.equal(r.status,status,raw.slice(0,1000));return raw?JSON.parse(raw).data:null;};
 try{
  for(const role of ['ADMIN','SCOUT'])users.push(await createUser({username:`squad_v3_${role}_${tag}`,email:`squad_v3_${role.toLowerCase()}_${tag}@example.com`,password:'FixtureV3Pass123',role}));
  const tokens=[];for(const u of users)tokens.push((await call(200,'POST','/auth/login',{email:u.email,password:'FixtureV3Pass123'})).accessToken);const [admin,scout]=tokens;
  const template=await call(200,'GET','/matching/v3/template',undefined,scout);assert.equal(template.implementationStage,4);assert.equal(template.roleScoringAvailable,true);assert.equal(template.scoringAvailable,true);
  const configBody=structuredClone(template.config);configBody.name='V3 squad fixture '+tag;configBody.parameters.settings.minimumReferencePlayers=1;
  const config=await call(201,'POST','/scoring-configs',configBody,admin);configs.push(config.id);
  for(let i=0;i<3;i++){
   const p=await prisma.player.create({data:{name:`V3 squad fixture ${i}`,transfermarktId:1800000000+(tag%1000000)+i,dateOfBirth:new Date('2000-01-01'),nationality:'TEST',position:i===2?'GK':'ST',height:180,marketValue:1,preferredFoot:'RIGHT'}});players.push(p);
   const stats=await prisma.playerStats.create({data:{playerId:p.id,season,minutesPlayed:2000,appearances:25,goals:10+i,assists:5,tacklesWon:20,interceptions:10,keyPasses:30,passesCompleted:1000,passesAttempted:1200,yellowCards:0,redCards:0}});
   const keys=i===2?C.inputMetrics.goalkeeper:C.inputMetrics.outfield;
   const values=Object.fromEntries(keys.map(k=>[k,{value:C.percentageMetrics.has(k)?50:1+i,unit:C.percentageMetrics.has(k)?'PERCENT':'PER_90',status:k==='pressuresPer90'?'ESTIMATED':'DERIVED',basis:'TEST_FIXTURE',...(C.ratioMetrics.has(k)?{successes:5,attempts:10}:{})}]));
   await prisma.playerStatsMetrics.create({data:{statsId:stats.id,method:'TEST',inputHash:metricInputHash(metricsInput(p,stats,null)),sourceHash:'a'.repeat(64),values,evidence:{leagues:['Premier League']}}});
  }
  const body={playerId:players[0].id,season,configId:config.id};
  await call(401,'POST','/matching/v3/squad/preview',body);await call(409,'POST','/matching/v3/squad/preview',body,scout);
  const history=await prisma.matchResult.count();
  const first=await call(200,'POST','/matching/v3/squad/preview',body,admin);assert.equal(first.roles.length,33);assert.equal(first.player.name,players[0].name);assert.equal(first.cache.hit,false);assert.equal(first.savedHistory,false);
  const second=await call(200,'POST','/matching/v3/squad/preview',{...body,roleIds:['POACHER']},admin);assert.equal(second.cache.hit,true);assert(second.squadScore!==null);
  const other=await call(200,'POST','/matching/v3/squad/preview',{...body,playerId:players[1].id},admin);assert.equal(other.reference.datasetHash,first.reference.datasetHash);
  const strict=await call(200,'POST','/matching/v3/squad/preview',{...body,options:{dataMode:'OBSERVED_ONLY'}},admin);assert.notEqual(strict.reference.configHash,first.reference.configHash);assert.equal(strict.roles.find(r=>r.roleId==='PRESSING_FWD').score,null);
  const keeper=await call(200,'POST','/matching/v3/squad/preview',{...body,playerId:players[2].id},admin);assert.equal(keeper.roles.length,2);assert(keeper.roles.every(r=>r.group==='GK'));
  const wrong=await call(200,'POST','/matching/v3/squad/preview',{...body,roleIds:['TRADITIONAL_GK']},admin);assert.equal(wrong.squadScore,null);
  for(const patch of [{roleIds:['BAD']},{roleIds:['POACHER','POACHER']},{season:'2026/2027'},{options:{dataMode:'FAKE'}},{save:true},{options:{feeTolerance:1}}])await call(400,'POST','/matching/v3/squad/preview',{...body,...patch},admin);
  await call(404,'POST','/matching/v3/squad/preview',{...body,playerId:2147483647},admin);
  const s=await prisma.playerStats.findUnique({where:{playerId_season:{playerId:players[0].id,season}}});const m=await prisma.playerStatsMetrics.findUnique({where:{statsId:s.id}});
  const changed=structuredClone(m.values);changed.expectedGoalsPer90.value=99;
  // Even if the writer forgets sourceHash/generatedAt, actual JSON edits invalidate cache.
  await prisma.playerStatsMetrics.update({where:{statsId:s.id},data:{values:changed}});
  const refreshed=await call(200,'POST','/matching/v3/squad/preview',body,admin);assert.equal(refreshed.cache.hit,false);assert.notEqual(refreshed.reference.datasetHash,first.reference.datasetHash);
  await prisma.player.update({where:{id:players[0].id},data:{height:190}});
  const stale=await call(200,'POST','/matching/v3/squad/preview',body,admin);assert.equal(stale.metricsStale,true);assert.equal(stale.roles.find(r=>r.roleId==='POACHER').score,null);
  await call(403,'POST','/matching/v3/roles/rebuild',{season},scout);
  const built=await call(200,'POST','/matching/v3/roles/rebuild',{season,configId:config.id},admin);assert(built.players>=3);assert.equal(built.savedHistory,false);
  assert.equal(await prisma.matchResult.count(),history);
  console.log('PASS: V3 role API,35 roles across outfield/GK,strict/prototype,selection,auth/config scope,real-JSON/profile cache invalidation,bulk rebuild,no MatchResult writes.');
 }finally{
  const ids=players.map(p=>p.id),uids=users.map(u=>u.id);
  if(ids.length){await prisma.playerStats.deleteMany({where:{playerId:{in:ids}}});await prisma.player.deleteMany({where:{id:{in:ids}}});}
  if(uids.length)await prisma.auditLog.deleteMany({where:{actorId:{in:uids}}});if(configs.length)await prisma.scoringConfig.deleteMany({where:{id:{in:configs}}});if(uids.length)await prisma.user.deleteMany({where:{id:{in:uids}}});
  await new Promise(r=>server.close(r));await prisma.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
