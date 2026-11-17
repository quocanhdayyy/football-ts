const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const source = fs.readFileSync(path.join(__dirname, '../public/login.js'), 'utf8');
  const users = [];
  const storage = new Map();
  let requestCount = 0;
  let v3Override = null;
  let squadOverride = null, squadRequest = null;
  let matchHandler = null, matchRequest = null;
  const mount = () => {
    const nodes = new Map();
    const element = () => ({ children: [], value: '', textContent: '', append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } });
    const node = id => {
      if (!nodes.has(id)) nodes.set(id, {
        ...element(),
        value: id === 'api-endpoint' ? '/api/transfers' : '',
        type: id === 'password' ? 'password' : '', hidden: id === 'account-panel' || id === 'api-result',
        disabled: false, textContent: '', className: '', events: {},
        addEventListener(name, listener) { this.events[name] = listener; },
        setAttribute() {},
      });
      return nodes.get(id);
    };
    vm.runInNewContext(source, {
      document: { getElementById: node, createElement: element },
      sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
      fetch: (url, options) => {
        requestCount++;
        if (url === '/api/matching/v3/template' && v3Override) return Promise.resolve(v3Override);
        if (url === '/api/matching/v3/squad/preview') {
          squadRequest = JSON.parse(options.body);
          if (squadOverride) return Promise.resolve(squadOverride);
        }
        if (url === '/api/matching/v3/evaluate' || url === '/api/matching/v3/search') {
          matchRequest = JSON.parse(options.body); if (matchHandler) return Promise.resolve(matchHandler(url, matchRequest));
        }
        return fetch(base + url, options);
      },
      Date, JSON, Error, Set,
    });
    return node;
  };
  const login = async (node, user) => {
    node('email').value = user.email; node('password').value = 'PageTestPass123';
    await node('login-form').events.submit({ preventDefault() {} });
    assert.equal(node('account-panel').hidden, false);
  };
  try {
    const html = await fetch(base + '/login');
    assert.equal(html.status, 200); const markup = await html.text();
    assert(markup.includes('id="api-test-button"')); assert(markup.includes('id="v3-strategy"'));
    assert(markup.includes('bấm tính Matching V3'));
    for (const asset of ['login.css', 'login.js']) assert.equal((await fetch(base + '/login-assets/' + asset)).status, 200);
    const tag = Date.now();
    for (const role of ['ADMIN', 'SCOUT']) users.push(await createUser({ username: `page_${role}_${tag}`, email: `page_${role.toLowerCase()}_${tag}@example.com`, password: 'PageTestPass123', role }));
    let node = mount();
    await login(node, users[0]);
    assert.equal(node('v3-strategy').children.length, 4); assert.equal(node('v3-strategy').disabled, false);
    assert.equal(node('v3-strategy').value, 'BALANCED');
    const choices = { MONEYBALL:[50,30,20], BALANCED:[30,50,20], LONG_TERM:[20,30,50], IMMEDIATE_ROLE:[20,70,10] };
    const beforeSelection = requestCount;
    for (const [key, weights] of Object.entries(choices)) {
      node('v3-strategy').value = key; node('v3-strategy').events.change();
      ['financial','squad','risk'].forEach((field,i) => assert.equal(node('v3-weight-' + field).textContent, weights[i] + '%'));
      assert(node('v3-status').textContent.includes('Bấm Tính Matching V3'));
    }
    assert.equal(requestCount, beforeSelection); // Selecting strategies makes no writes or scoring requests.
    await node('v3-reload-button').events.click(); assert.equal(node('v3-strategy').value, 'IMMEDIATE_ROLE');
    v3Override = { status:503, ok:false, json:async()=>({message:'V3 fixture temporarily unavailable'}) };
    await node('v3-reload-button').events.click();
    assert.equal(node('account-panel').hidden,false); assert.equal(node('v3-strategy').disabled,true); assert.equal(node('v3-weights').hidden,true);
    assert(node('v3-status').textContent.includes('temporarily unavailable'));
    v3Override = { status:200, ok:true, json:async()=>({data:{strategies:{...Object.fromEntries(Object.entries(choices).map(([key,w])=>[key,{financial:w[0]/100,squad:w[1]/100,risk:w[2]/100}])),BALANCED:{financial:.9,squad:.5,risk:.2}}}}) };
    await node('v3-reload-button').events.click();assert.equal(node('v3-strategy').disabled,true);assert(node('v3-status').textContent.includes('chưa hợp lệ'));
    v3Override = null;await node('v3-reload-button').events.click();assert.equal(node('v3-strategy').disabled,false);
    assert.equal(node('v3-role').children.length,36);
    const beforeInvalidRole=requestCount;
    node('v3-player').value='invalid';node('v3-season').value='2025/2026';
    await node('v3-squad-form').events.submit({preventDefault(){}});assert.equal(requestCount,beforeInvalidRole);
    node('v3-player').value='1700';node('v3-mode').value='PROTOTYPE';node('v3-role').value='POACHER';node('v3-shift').checked=false;
    squadOverride={status:200,ok:true,json:async()=>({status:'success',data:{player:{name:'UI fixture player',position:'ST'},minutesPlayed:2000,minutesScore:100,cap:100,dataMode:'PROTOTYPE',reference:{count:10},roles:[{roleId:'POACHER',roleName:'Poacher',eligible:true,quality:80,score:84,estimatedWeight:.2,missing:[]}],warnings:['PROTOTYPE fixture warning'],ambiguousTopRole:false,cache:{hit:false}}})};
    await node('v3-squad-form').events.submit({preventDefault(){}});
    assert(node('v3-squad-status').textContent.includes('UI fixture player'));assert.equal(node('v3-squad-breakdown').hidden,false);
    assert.equal(squadRequest.roleIds[0],'POACHER');assert.equal(squadRequest.options.dataMode,'PROTOTYPE');assert(!Object.hasOwn(squadRequest,'strategy'));
    const texts=element=>[element.textContent,...(element.children||[]).flatMap(texts)];
    assert(texts(node('v3-squad-breakdown')).includes('Poacher'));assert(texts(node('v3-squad-breakdown')).includes('84'));
    squadOverride=null;
    const fillV3=()=>{for(const[id,value]of Object.entries({'v3-match-player':'1700','v3-match-requirement':'42','v3-match-season':'2025/2026','v3-match-role':'POACHER','v3-match-mode':'PROTOTYPE','v3-fee-tolerance':'20','v3-wage-tolerance':'50','v3-min-minutes':'900','v3-min-score':'70','v3-value-source':''}))node(id).value=value;};
    fillV3();
    matchHandler=(url,body)=>{
      const w=choices[body.strategy],weights={financial:w[0]/100,squad:w[1]/100,risk:w[2]/100};
      const result={player:{name:'Full V3 UI fixture'},status:'COMPLETE',complete:true,totalScore:(80*w[0]+90*w[1]+70*w[2])/100,financialScore:80,squadScore:90,riskScore:70,missing:[],excluded:[],prosCons:{warnings:[]},saved:body.save===true,resultId:body.save?999:null};
      return{status:200,ok:true,json:async()=>({status:'success',data:{...(url.endsWith('/search')?{ranked:[result],incomplete:[],excluded:[],meta:{rankedCount:1,incompleteCount:0,excludedCount:0}}:result),config:{pillarWeights:weights}}})};
    };
    for(const key of Object.keys(choices)){
      node('v3-strategy').value=key;node('v3-strategy').events.change();
      await node('v3-matching-form').events.submit({preventDefault(){}});
      assert.equal(matchRequest.strategy,key);assert.equal(matchRequest.options.feeTolerance,.2);assert.equal(matchRequest.options.wageTolerance,.5);
      const data=JSON.parse(node('v3-match-result').textContent).data;const w=choices[key];assert.equal(data.totalScore,(80*w[0]+90*w[1]+70*w[2])/100);
      assert(node('v3-match-status').textContent.includes('Đã tính đủ'));
    }
    node('v3-match-save').checked=true;await node('v3-matching-form').events.submit({preventDefault(){}});assert(matchRequest.save);
    await node('v3-search-button').events.click();assert(!Object.hasOwn(matchRequest,'save'));assert(!Object.hasOwn(matchRequest,'playerId'));assert(node('v3-match-status').textContent.includes('1 người đủ điều kiện'));
    matchHandler=()=>({status:503,ok:false,json:async()=>({message:'Full V3 fixture temporarily unavailable'})});
    await node('v3-matching-form').events.submit({preventDefault(){}});assert(node('v3-match-status').textContent.includes('temporarily unavailable'));assert.equal(node('account-panel').hidden,false);
    matchHandler=null;node('v3-match-save').checked=false;
    await node('api-test-button').events.click();
    assert(node('api-status').textContent.includes('HTTP 200'));
    assert.equal(JSON.parse(node('api-result').textContent).status, 'success');
    const saved = JSON.parse([...storage.values()][0]);
    assert(!node('api-result').textContent.includes(saved.accessToken));
    const beforeInvalidMatching = requestCount;
    await node('matching-form').events.submit({ preventDefault() {} });
    assert.equal(requestCount, beforeInvalidMatching);
    for (const [id, value] of Object.entries({ 'matching-player-id': '2147483647', 'matching-requirement-id': '2147483647', 'matching-season': '2025/2026', 'matching-form-role': 'PRIMARY' })) node(id).value = value;
    await node('matching-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('matching-result').textContent).status, 'error');
    assert(!node('matching-result').textContent.includes(saved.accessToken));
    assert.equal(node('account-panel').hidden, false);
    node('api-endpoint').value='/api/matching/v3/template'; node('api-record-id').value='';
    await node('api-test-button').events.click();assert.equal(JSON.parse(node('api-result').textContent).data.scoringAvailable,true);
    node('api-endpoint').value='/api/transfers';
    const fillFinancial = () => {
      for (const [id, value] of Object.entries({ 'financial-budget': '200000000', 'financial-fee': '180000000', 'financial-salary-limit': '30000000', 'financial-salary': '27000000', 'financial-months': '48' })) node(id).value = value;
    };
    fillFinancial();
    await node('financial-form').events.submit({ preventDefault() {} });
    assert(node('financial-status').textContent.includes('79/100'));
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, 79);
    assert(!node('financial-result').textContent.includes(saved.accessToken));
    node('financial-fee').value = '220000000';
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, 68.2);
    node('financial-fee').value = '';
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, null);
    assert(node('financial-status').textContent.includes('Chưa đủ dữ liệu'));
    const beforeInvalidFinancialId = requestCount;
    node('financial-player-id').value = 'abc'; node('financial-requirement-id').value = '1';
    await node('financial-evaluate-button').events.click();
    assert.equal(requestCount, beforeInvalidFinancialId);
    node('financial-player-id').value = '2147483647'; node('financial-requirement-id').value = '2147483647';
    await node('financial-evaluate-button').events.click();
    assert.equal(JSON.parse(node('financial-result').textContent).status, 'error');
    assert.equal(node('account-panel').hidden, false);
    node('api-endpoint').value = '/api/players'; node('api-record-id').value = '2147483647';
    await node('api-test-button').events.click(); assert(node('api-status').textContent.includes('HTTP 404'));
    const before = requestCount;
    node('api-record-id').value = 'abc'; await node('api-test-button').events.click(); assert.equal(requestCount, before);
    node('api-record-id').value = ''; node('api-endpoint').value = '/api/auth/login';
    await node('api-test-button').events.click(); assert.equal(requestCount, before);
    node = mount();
    for (let i = 0; i < 200 && (node('account-panel').hidden || node('login-button').disabled); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(node('account-panel').hidden, false); // Restores the existing tab session, no new login.
    await node('logout-button').events.click();
    assert.equal(node('api-result').hidden, true); assert.equal(storage.size, 0);
    assert.equal(node('financial-result').hidden, true); assert.equal(node('financial-result').textContent, '');
    assert.equal(node('matching-result').hidden, true); assert.equal(node('matching-result').textContent, '');
    assert.equal(node('v3-strategy').disabled,true);assert.equal(node('v3-weights').hidden,true);assert.equal(node('v3-weight-financial').textContent,'');
    assert.equal(node('v3-squad-result').textContent,'');assert.equal(node('v3-squad-breakdown').hidden,true);
    await login(node, users[1]);
    node('api-endpoint').value = '/api/audit-logs';
    await node('api-test-button').events.click(); assert(node('api-status').textContent.includes('HTTP 403'));
    assert.equal(node('account-panel').hidden, false);
    await prisma.authSession.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
    node('api-endpoint').value = '/api/transfers';
    await node('api-test-button').events.click();
    assert.equal(node('account-panel').hidden, true); assert.equal(storage.size, 0); assert.equal(node('api-result').textContent, '');
    await login(node, users[1]); fillFinancial();
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, 79);
    await prisma.authSession.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(node('account-panel').hidden, true); assert.equal(storage.size, 0);
    assert.equal(node('financial-result').textContent, '');
    await login(node, users[1]);
    for (const [id, value] of Object.entries({ 'matching-player-id': '2147483647', 'matching-requirement-id': '2147483647', 'matching-season': '2025/2026', 'matching-form-role': 'PRIMARY' })) node(id).value = value;
    await prisma.authSession.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
    await node('matching-form').events.submit({ preventDefault() {} });
    assert.equal(node('account-panel').hidden, true); assert.equal(storage.size, 0);
    assert.equal(node('matching-result').textContent, '');
    await login(node, users[1]);
    await prisma.authSession.updateMany({where:{userId:users[1].id},data:{expiresAt:new Date(0)}});
    await node('v3-reload-button').events.click();assert.equal(node('account-panel').hidden,true);assert.equal(node('v3-strategy').disabled,true);assert.equal(storage.size,0);
    await login(node,users[1]);fillV3();
    await prisma.authSession.updateMany({where:{userId:users[1].id},data:{expiresAt:new Date(0)}});
    await node('v3-matching-form').events.submit({preventDefault(){}});assert.equal(node('account-panel').hidden,true);assert.equal(node('v3-match-result').textContent,'');
    console.log('PASS: V3 strategy UI reads all four server weights, selection never scores/writes, reload/error/retry/logout/expiry handled; existing GET/F/Matching testers still work (DOM simulation + real API).');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
