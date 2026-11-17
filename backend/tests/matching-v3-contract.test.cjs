const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../src/services/matching/v3/config.ts'),{matchingV3OpenApi:spec}=require('../src/docs/matching-v3.openapi.ts');
const F=require('../src/services/matching/v3/financial.ts'),R=require('../src/services/matching/v3/risk.ts');
test('portable OpenAPI stays in sync;local references resolve;all operations secured except login',()=>{
 assert.deepEqual(JSON.parse(fs.readFileSync(require.resolve('../docs/api/matching-v3.openapi.json'),'utf8')),spec);
 const walk=v=>{if(!v||typeof v!=='object')return;if(Array.isArray(v.required))assert(v.required.length>0,'OpenAPI3.0 required arrays must not be empty');if(v.$ref){assert(v.$ref.startsWith('#/'));let at=spec;for(const key of v.$ref.slice(2).split('/'))at=at[key];assert(at,'unresolved '+v.$ref);}for(const x of Object.values(v))walk(x)};walk(spec);
 assert.equal(spec.security[0].bearerAuth.length,0);assert.deepEqual(spec.paths['/auth/login'].post.security,[]);
 const operations=new Set();for(const[path,entry]of Object.entries(spec.paths))for(const[method,op]of Object.entries(entry)){if(!['get','post','patch','delete'].includes(method))continue;assert(!operations.has(op.operationId));operations.add(op.operationId);if(path!=='/auth/login')assert.equal(op.security,undefined);}
 assert.equal(spec.components.schemas.Evaluation.properties.implementationStage.enum[0],C.IMPLEMENTATION_STAGE);
 assert.deepEqual(spec.components.schemas.EvaluateRequest.properties.roleIds.items.enum,C.roles.map(r=>r.id));
 assert.deepEqual(spec.components.schemas.Options.default,C.defaultOptions);
 assert.deepEqual(spec.components.schemas.EvaluateRequest.not,{required:['strategy','pillarWeights']});
 for(const action of ['evaluate','rank','search'])assert(spec.paths['/matching/v3/'+action].post);
 assert(!spec.components.schemas.SearchRequest.properties.playerIds);assert(!spec.components.schemas.RankRequest.properties.save);
 assert.equal(spec.components.schemas.Evaluation.properties.riskScore.nullable,true);
});
test('affordability sanity:bounded,monotone,continuous at cap;does not invent score for missing amounts',()=>{
 for(const[cap,tau,a,b]of [[60,.2,.9,.3],[10,.5,.96,.36],[.3,.5,.9,.3]]){
  let previous=101;for(let i=0;i<=200;i++){const amount=cap*(1+tau)*i/200,result=F.affordability(amount,cap,tau,a,b);assert(result.score>=0&&result.score<=100);assert(result.score<=previous+1e-8);previous=result.score;}
  assert(Math.abs(F.affordability(cap,cap,tau,a,b).score-60)<1e-8);
  assert.equal(F.affordability(null,cap,tau,a,b).score,null);
 }
 const config=C.builtinConfig(),options=C.parseOptions();let previous=101;
 for(let age=20;age<=40;age+=.1){const score=R.resaleAge(age);assert(score>=0&&score<=100);assert(score<=previous+1e-8);previous=score;}
 const ageOptions=[{...options,holdingYears:0},{...options,holdingYears:3}];assert(R.resaleAge(28+ageOptions[0].holdingYears)>=R.resaleAge(28+ageOptions[1].holdingYears));
 assert.equal(F.financial({fee:null,wage:null,budget:60,salaryLimit:10,contractYears:3},config,options).score,null);
});
