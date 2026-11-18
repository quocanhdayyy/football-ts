const {test}=require('node:test'),assert=require('node:assert/strict');
const {Prisma}=require('../src/generated/prisma/client.ts'),C=require('../src/services/matching/v3/config.ts');
const F=require('../src/services/matching/v3/financial.ts'),R=require('../src/services/matching/v3/risk.ts');
const {shiftCalendarMonths:shift}=require('../src/services/matching/matching-scoring.service.ts');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`),config=C.builtinConfig(),options=C.parseOptions(),settings=config.settings,day=new Date('2026-11-17T00:00:00Z');
test('fee V3 half75/cap60,wage half78/cap60,continuous overage and tolerance boundaries',()=>{
 const fee=(n,t=.2)=>F.affordability(n,60,t,.9,.3),wage=n=>F.affordability(n,10,.5,.96,.36);
 for(const [n,s]of [[0,90],[30,75],[60,60],[66,30],[72,0]])near(fee(n).score,s);
 assert.equal(fee(72).allowed,true);assert.equal(fee(72.000001).allowed,false);assert.equal(fee(60.000001,0).allowed,false);
 near(wage(0).score,96);near(wage(5).score,78);near(wage(10).score,60);near(wage(15).score,0);assert(!wage(15.01).allowed);
 near(fee(60-1e-9).score,60);near(fee(60+1e-9).score,60);assert.equal(fee(null).allowed,null);assert.throws(()=>fee(-1));
 const cents=F.affordability(.45,.3,.5,.9,.3);assert(cents.allowed);near(cents.score,0);
});
test('contract2–4year preference preserved and missing values never reweighted',()=>{
 for(const [c,s]of [[0,40],[.5,55],[1,70],[2,100],[4,100],[5,70]])near(F.financial({fee:30,wage:5,budget:60,salaryLimit:10,contractYears:c},config,options).scores.contract,s);
 assert.equal(F.weighted({a:null,b:80},{a:.5,b:.5}),null);near(F.weighted({a:null,b:80},{a:0,b:1}),80);
});
const coverage={injuryCoveredFrom:shift(day,-24),injuryCoveredThrough:day,injuryVerifiedAt:day,injurySource:'TEST_ONLY'};
const injury=(a,b,region='KNEE')=>({startDate:new Date(a),endDate:b?new Date(b):null,bodyRegion:region});
test('unknown injury is not100,explicit fallback only in prototype,verified healthy100',()=>{
 assert.equal(R.injuryScore([],null,day,day,settings,true).score,null);near(R.injuryScore([],coverage,day,day,settings,true).score,100);
 assert.equal(R.injuryScore([],null,day,day,{...settings,missingInjuryScore:70},false).score,null);
 const p=R.injuryScore([],null,day,day,{...settings,missingInjuryScore:70},true);assert.equal(p.score,70);assert(p.estimated);
});
test('injury union and12month split,recurrence,severity and clipped window',()=>{
 const d=R.injuryScore([injury('2025-11-07','2025-11-27'),injury('2025-11-15','2025-11-30')],coverage,day,day,settings,true);
 near(d.olderDays,10);near(d.recentDays,13);near(d.weightedDays,19);near(d.recurrencePenalty,0);
 const r=R.injuryScore([injury('2026-01-01','2026-01-11'),injury('2026-02-01','2026-02-11')],coverage,day,day,settings,true);near(r.recurrencePenalty,8);
 const severe=R.injuryScore([injury('2024-01-01',null)],coverage,day,day,settings,true);near(severe.weightedDays,180);near(severe.severePenalty,10);near(severe.score,0);
 assert.equal(R.injuryScore([injury('2026-01-01','2026-01-11',null)],coverage,day,day,settings,true).score,null);
 assert.equal(R.injuryScore([],coverage,day,new Date('2026-01-01'),settings,true).score,null);
 const future=R.injuryScore([injury('2026-11-01','2027-06-01')],coverage,day,day,settings,true);near(future.recentDays,16);near(future.severePenalty,0);assert(future.ongoing);
});
test('resale age uses future age and interpolates correctly',()=>{for(const[a,s]of[[20,100],[26,100],[28,80],[29,70],[30.5,50],[32,30],[35,0],[40,0]])near(R.resaleAge(a),s)});
function series(g=.18){const start=shift(day,-24);return[-24,-18,-12,-6,0].map((m,i)=>{const d=shift(day,m);return{id:i+1,source:'TEST',valuedAt:d,recordedAt:day,reliability:'VERIFIED',marketValue:new Prisma.Decimal(1e7*Math.exp(g*(d-start)/86400000/365.2425))}})}
test('value growth uses OLS log-price actual dates;constant price T50,V100,score70',()=>{
 const d=R.priceScore(series(),day,day,settings);near(d.growth,.18);assert.equal(d.anchors.length,5);assert(d.sigma>=0);
 const flat=R.priceScore(series(0),day,day,settings);near(flat.trend,50);near(flat.volatility,100);near(flat.score,70);
});
test('missing/ambiguous/stale/future valuation series do not produce fake price scores',()=>{
 const values=series();assert.equal(R.priceScore(values.slice(2),day,day,settings).score,null);
 assert.equal(R.priceScore([...values,{...values[0],source:'OTHER'}],day,day,settings).score,null);
 assert(R.priceScore([...values,{...values[0],source:'OTHER'}],day,day,settings,'TEST').score!==null);
 assert.equal(R.priceScore(values.map(v=>({...v,recordedAt:new Date('2027-01-01')})),day,day,settings).score,null);
 assert.equal(R.priceScore(values.slice(1),day,day,settings).score,null); // missing oldest anchor; never look forward
 assert.equal(R.priceScore(values.map(v=>({...v,marketValue:new Prisma.Decimal(0)})),day,day,settings).score,null);
});
test('report M yields78.981266...,and strategies affect only total',()=>{
 const f=F.financial({fee:20.7,wage:4.2,budget:25,salaryLimit:6,contractYears:3},config,options).score;
 const s=.2*100+.8*76.76,injury=100*(1-(21+.6*14)/180),resale=.6*80+.4*(.6*80+.4*60),r=.5*injury+.5*resale;
 near(f,74.102);near(s,81.408);near(r,80.23333333333333);near(F.weighted({financial:f,squad:s,risk:r},C.strategies.BALANCED),78.98126666666667);
 assert.notEqual(F.weighted({financial:f,squad:s,risk:r},C.strategies.MONEYBALL),F.weighted({financial:f,squad:s,risk:r},C.strategies.IMMEDIATE_ROLE));
});

test('free agent requires current dated evidence,source,and no active contract',()=>{
 const v={registrationStatus:'FREE_AGENT',registrationAsOf:day,registrationVerifiedAt:day,registrationSource:'TEST registry'};
 assert(F.verifiedFreeAgent(v,false,day,day));
 assert(!F.verifiedFreeAgent({...v,registrationSource:null},false,day,day));
 assert(!F.verifiedFreeAgent({...v,registrationSource:'   '},false,day,day));
 assert(!F.verifiedFreeAgent(v,true,day,day));
 assert(!F.verifiedFreeAgent({...v,registrationAsOf:shift(day,-1)},false,day,day));
 assert(!F.verifiedFreeAgent({...v,registrationVerifiedAt:new Date('2027-01-01')},false,day,day));
});
