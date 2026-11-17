// Generate a portable OpenAPI document; no database or credentials required.
const fs=require('node:fs'),path=require('node:path');
const {matchingV3OpenApi}=require('../src/docs/matching-v3.openapi.ts');
const output=path.resolve(__dirname,'../docs/api/matching-v3.openapi.json');
const value=JSON.stringify(matchingV3OpenApi,null,2)+'\n';
if(process.argv.length>3 || (process.argv[2] && process.argv[2]!=='--check'))throw new Error('Usage: npm run matching:v3:openapi [-- --check]');
if(process.argv[2]==='--check'){
 if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==value)throw new Error('OpenAPI cũ; chạy npm run matching:v3:openapi rồi commit file JSON.');
 console.log('PASS: OpenAPI khớp hợp đồng nguồn.');
}else{fs.writeFileSync(output,value);console.log(output)}
