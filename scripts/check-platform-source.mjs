import {readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const files=[];async function walk(path){for(const item of await readdir(path,{withFileTypes:true})){if(['dist','node_modules'].includes(item.name))continue;const p=`${path}/${item.name}`;if(item.isDirectory())await walk(p);else if(/\.[cm]?[jt]sx?$/.test(item.name))files.push(p);}}
await walk('apps');await walk('packages');await walk('server');let failures=0;
for(const file of files){const text=await readFile(file,'utf8');for(const rule of [/dangerouslySetInnerHTML/,/\beval\s*\(/,/new Function\s*\(/,/rejectUnauthorized\s*:\s*false/])if(rule.test(text)){console.error(`Unsafe source pattern: ${file}`);failures++;}}
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\n').filter(Boolean);
for(const file of tracked){if(/(^|\/)\.env$|(^|\/)\.local\//.test(file)){console.error(`Private file must not be tracked: ${file}`);failures++;}if(!/\.(ts|tsx|js|mjs|json|md|yml|yaml|sql)$/.test(file)||file.startsWith('references/'))continue;const content=await readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{48,}|\bbvk_[A-Za-z0-9_-]{43}\b/.test(content)){console.error(`Potential credential in source: ${file}`);failures++;}}
if(failures)process.exit(1);console.log(`Source safety checks passed (${files.length} platform files; tracked private-file and credential checks).`);
