const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/services/matching/v3/config.ts'),P=require('../src/services/matching/v3/performance.ts');
const {metricsInput,metricInputHash}=require('../src/services/player-metrics-input.ts');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`), settings={...C.defaultSettings,minimumReferencePlayers:1};
function fixture(id=1,position='CM',minutes=2000){
  const row={id,playerId:id,season:'2025/2026',appearances:25,minutesPlayed:minutes,goals:10,assists:5,tacklesWon:20,interceptions:15,keyPasses:40,passesCompleted:1000,passesAttempted:1100,yellowCards:0,redCards:0,positionMinutes:null,positionMinutesSource:null,estimate:null,
    player:{id,transfermarktId:id,name:'TEST '+id,dateOfBirth:new Date('2000-01-01'),position,height:180}};
  const values=Object.fromEntries(C.knownMetrics.map(k=>[k,{value:C.percentageMetrics.has(k)?50:1,unit:C.percentageMetrics.has(k)?'PERCENT':'PER_90',status:'DERIVED',basis:'TEST',...(C.ratioMetrics.has(k)?{successes:1,attempts:2}:{})}]));
  row.metrics={inputHash:metricInputHash(metricsInput(row.player,row,null)),values,evidence:{leagues:['Premier League']}};return row;
}
const c=(row,mode='PROTOTYPE')=>P.normalizeCandidate(row,mode);
test('midrank ties and empty reference,unique79th/100=79.5',()=>{near(P.percentile(Array.from({length:100},(_,i)=>i),79).score,79.5);near(P.percentile([0,1,1,1,3],1).score,50);assert.equal(P.percentile([],1).score,null)});
test('smoothing shrinks tiny ratios; means are explicitly attempt-weighted or per-player',()=>{
  near(P.smooth({value:100,successes:2,attempts:2},.6,30),62.5);near(P.smooth({value:80,successes:80,attempts:100},.6,30),75.38461538461539);
  const a=fixture(),b=fixture(2);Object.assign(a.metrics.values.aerialWinPercentage,{value:100,successes:2,attempts:2});Object.assign(b.metrics.values.aerialWinPercentage,{value:80,successes:80,attempts:100});
  near(P.buildReference([c(a),c(b)],settings).groups.MIDFIELD.aerialWinPercentage.mean,82/102);
  near(P.buildReference([c(a),c(b)],{...settings,ratioMean:'PLAYER_MEAN'}).groups.MIDFIELD.aerialWinPercentage.mean,.9);
});
test('reference scope is top5,same group,>=450 minutes,estimates excluded in strict mode',()=>{
  const a=fixture(1,'CM',450),b=fixture(2,'ST',450),low=fixture(3,'CM',449),out=fixture(4);out.metrics.evidence.leagues=['Eredivisie'];
  a.metrics.values.expectedGoalsPer90.status='ESTIMATED';
  const r=P.buildReference([c(a),c(b),c(low),c(out)],settings);assert.equal(r.count,2);assert.equal(r.groups.MIDFIELD.expectedGoalsPer90.values.length,1);
  assert.equal(P.buildReference([c(a,'OBSERVED_ONLY')],settings).groups.MIDFIELD.expectedGoalsPer90.values.length,0);
});
test('stale advanced metrics rejected; raw observed0 remains valid;minutes0 cannot score',()=>{
  const a=fixture();a.goals=0;a.player.height=190;const p=c(a);assert.equal(p.stale,true);assert.equal(p.metrics.goalsPer90.value,0);assert(!p.metrics.expectedGoalsPer90);
  const zero=c(fixture(2,'ST',0));assert.deepEqual(zero.metrics,{});assert(P.scoreVector(zero,P.buildReference([c(fixture(3,'ST'))],settings),settings).roles.every(r=>r.score===null));
});
test('minutes boundaries respect the exact role cap,including900=>65',()=>{
  const reference=P.buildReference([c(fixture(100))],settings);
  // Force strong but valid percentiles in a fixed test benchmark.
  for(const d of Object.values(reference.groups.MIDFIELD))d.values=[0];
  for(const [minutes,cap]of [[450,42.5],[600,50],[900,65],[1000,70],[1500,95],[2000,100]]){
    const vector=P.scoreVector(c(fixture(1,'CM',minutes)),reference,settings);const role=vector.roles.find(r=>r.roleId==='BOX_TO_BOX');near(vector.cap,cap);near(role.score,Math.min(.2*vector.minutesScore+80,cap));
  }
});
test('Excel example preserves weights,Q72.86 and score78.288 before rounding',()=>{
  const role=C.roles.find(r=>r.id==='BOX_TO_BOX');const percentiles=[55,52,55,60,58,64,80,50,70,62,66,58,48,90,70,96,97,85];
  const keys=['goalsPer90','expectedGoalsPer90','assistsPer90','expectedAssistsPer90','keyPassesPer90','progressivePassesPer90','progressiveCarriesPer90','passesCompletedPer90','tacklesWonPer90','interceptionsPer90','possessionAdjustedTacklesPer90','possessionAdjustedInterceptionsPer90','aerialWinPercentage','pressuresPer90','pressureSuccessPercentage','sprintsPer90','distanceKmPer90','attackingThirdRecoveriesPer90'];
  const candidate=c(fixture(1,'CM',2430)),reference=P.buildReference([candidate],settings);
  // A 200-value sorted distribution can represent every supplied half-percentile exactly.
  keys.forEach((k,i)=>{const value=P.smooth(candidate.metrics[k],reference.groups.MIDFIELD[k].mean,settings.smoothingPrior);reference.groups.MIDFIELD[k].values=Array.from({length:200},(_,j)=>j<percentiles[i]*2?value-1:value+1)});
  const result=P.scoreVector(candidate,reference,settings).roles.find(r=>r.roleId===role.id);near(result.quality,72.86);near(result.score,78.288);
});
test('missing tracking transfers only to available receiver and preserves100%;missing goals stay null',()=>{
  const row=fixture();delete row.metrics.values.sprintsPer90;delete row.metrics.values.distanceKmPer90;
  const candidate=c(row),reference=P.buildReference([c(fixture(2))],settings);let result=P.scoreVector(candidate,reference,settings).roles.find(r=>r.roleId==='BOX_TO_BOX');
  assert(result.score!==null);assert.equal(result.transfers.length,2);near(Object.values(result.weights).reduce((a,b)=>a+b,0),1);
  delete candidate.metrics.pressuresPer90;result=P.scoreVector(candidate,reference,settings).roles.find(r=>r.roleId==='BOX_TO_BOX');assert.equal(result.score,null);assert(result.missing.some(m=>m.metric==='sprintsPer90'));
});
test('neighbor directions and25% require evidence;target benchmark is CAM,notCM',()=>{
  const row=fixture(),candidate=c(row);assert(!P.eligibility(candidate,'CAM',false).eligible);
  row.positionMinutes={CM:1500,CAM:500};row.positionMinutesSource='TEST';assert(P.eligibility(candidate,'CAM',false).eligible);
  row.positionMinutes.CAM=499;assert(!P.eligibility(candidate,'CAM',false).eligible);assert(P.eligibility(candidate,'CAM',true).eligible);assert(!P.eligibility(candidate,'GK',true).eligible);
  const reference=P.buildReference([candidate,c(fixture(2,'CAM'))],settings);reference.groups.MIDFIELD.progressivePassesPer90.values=[999];reference.groups.CAM.progressivePassesPer90.values=[0];
  const vector=P.scoreVector(candidate,reference,settings);near(vector.metricsByGroup.CAM.progressivePassesPer90.percentile,100);near(vector.metricsByGroup.MIDFIELD.progressivePassesPer90.percentile,0);
});
test('GK uses only two GK roles,own benchmark,and preserves negative goalsPrevented',()=>{
  const row=fixture(1,'GK');row.metrics.values.goalsPreventedPer90.value=-.2;
  const candidate=c(row),reference=P.buildReference([candidate,c(fixture(2,'CM'))],settings),vector=P.scoreVector(candidate,reference,settings);
  assert.equal(vector.roles.length,2);assert(vector.roles.every(r=>r.group==='GK'));near(vector.metricsByGroup.GK.goalsPreventedPer90.raw,-.2);near(vector.metricsByGroup.GK.goalsPreventedPer90.percentile,50);
});
test('too-small references return missing reasons; never replace unknown with0',()=>{
  const candidate=c(fixture()),vector=P.scoreVector(candidate,P.buildReference([candidate],settings),{...settings,minimumReferencePlayers:10});
  assert(vector.roles.every(r=>r.score===null));assert(vector.roles[0].missing.some(m=>m.reason==='INSUFFICIENT_REFERENCE'));
});
