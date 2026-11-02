import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const runtimeEnv={...process.env};for(const key of ['MIGRATION_DATABASE_URL','POSTGRES_PASSWORD','RUNTIME_DB_PASSWORD','AUTH_DB_PASSWORD','VAULT_DB_PASSWORD'])delete runtimeEnv[key];
const children=[spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{stdio:'inherit',env:runtimeEnv}),spawn(process.execPath,['--import','tsx','apps/worker/src/index.ts'],{stdio:'inherit',env:runtimeEnv}),spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','0.0.0.0','--port','5174','--strictPort'],{stdio:'inherit',env:runtimeEnv,cwd:resolve('apps/web')})];
let closing=false;function close(){if(closing)return;closing=true;for(const child of children)child.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,close);for(const child of children)child.on('exit',code=>{if(!closing){process.exitCode=code??1;close();}});
