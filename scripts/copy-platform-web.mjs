import { cp,mkdir } from 'node:fs/promises';
await mkdir('dist/app',{recursive:true});await cp('apps/web/dist','dist/app',{recursive:true});
