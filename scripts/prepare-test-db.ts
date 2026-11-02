import { Pool } from 'pg';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
// This command creates a dedicated database, never truncates the demo or a supplied customer DB.
const source=new URL(process.env.MIGRATION_DATABASE_URL!);const rootUrl=new URL(source);rootUrl.pathname='/postgres';
const root=new Pool({connectionString:rootUrl.toString()});
try{if(!(await root.query("SELECT 1 FROM pg_database WHERE datname='birdview_test'")).rowCount)await root.query('CREATE DATABASE birdview_test');}finally{await root.end();}
const text=await readFile('.env','utf8');const vars=Object.fromEntries(text.split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
for(const key of ['MIGRATION_DATABASE_URL','DATABASE_URL','AUTH_DATABASE_URL','VAULT_DATABASE_URL']){const url=new URL(vars[key]);url.pathname='/birdview_test';vars[key]=url.toString();}
Object.assign(vars,{BIRDVIEW_QUEUE_NAME:'birdview-test-jobs',DEMO_USERS_FILE:'.local/test-users.json',ARTIFACT_DIR:'.local/test-artifacts',WORKER_HEARTBEAT_FILE:'.local/test-worker-heartbeat',APP_PROFILE:'demo',NODE_ENV:'test'});
await mkdir('.local',{recursive:true,mode:0o700});await writeFile('.local/test.env',Object.entries(vars).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
console.log('Isolated test database and private environment prepared.');
