// Run integration suites sequentially: they temporarily activate isolated test configs.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&args[0]!=='--v3'))throw new Error('Usage: npm test | npm run test:matching-v3:all');
const core=['test:access','test:entities','test:extended','test:matching-data','test:matching-api','test:estimation','test:estimation-api','test:data-enrich','test:data-stats','test:data-prepare','test:metrics'];
const v3=['test:matching-v3','test:matching-v3-performance','test:matching-v3-financial-risk','test:matching-v3-contract','test:matching-v3-inputs-api','test:matching-v3-squad-api','test:matching-v3-engine-api','test:login'];
for(const name of [...(args.length?[]:core),...v3]){
 const result=spawnSync('npm',['run',name],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0){process.exitCode=result.status||1;break;}
}
