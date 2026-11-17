// Run sequentially: integration suites activate temporary configs and must not overlap.
const {spawnSync}=require('node:child_process');
const suites=[
 ['--test','tests/matching-v3-inputs.test.cjs'],['--test','tests/matching-v3-performance.test.cjs'],
 ['--test','tests/matching-v3-financial-risk.test.cjs'],['--test','tests/matching-v3-contract.test.cjs'],
 ['tests/matching-v3-inputs-api.test.cjs'],['tests/matching-v3-squad-api.test.cjs'],
 ['tests/matching-v3-engine-api.test.cjs'],['tests/login-page.test.cjs'],['tests/matching-engine-api.test.cjs'],
];
for(const args of suites){const r=spawnSync(process.execPath,['--import','tsx',...args],{cwd:require('node:path').resolve(__dirname,'..'),stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0){process.exitCode=r.status||1;break;}}
