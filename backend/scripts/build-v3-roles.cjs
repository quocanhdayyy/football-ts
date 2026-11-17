const {prisma}=require('../src/config/prisma.ts');
const {rebuildRoleCache}=require('../src/services/matching/v3/squad.service.ts');
(async()=>{
  const args=process.argv.slice(2);
  if(args.length%2||args.some((v,i)=>i%2===0&&!['--actor-id','--season','--data-mode'].includes(v))||new Set(args.filter((_,i)=>i%2===0)).size!==args.length/2)throw Error('Usage: npm run matching:v3:roles -- --actor-id ADMIN_ID [--season 2025/2026] [--data-mode PROTOTYPE|OBSERVED_ONLY]');
  const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
  const actor=Number(arg('--actor-id')),season=arg('--season','2025/2026'),mode=arg('--data-mode','PROTOTYPE');
  if(!Number.isInteger(actor)||actor<1||!['PROTOTYPE','OBSERVED_ONLY'].includes(mode)||!/^\d{4}\/\d{4}$/.test(season)||+season.slice(0,4)<1||+season.slice(5)!==+season.slice(0,4)+1||new Date(`${season.slice(5)}-07-01T00:00:00Z`)>new Date())throw Error('Invalid actor/season/data mode');
  console.log(JSON.stringify(await rebuildRoleCache(season,mode,undefined,actor),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
