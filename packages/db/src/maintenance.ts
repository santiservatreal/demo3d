import type { RequestContext } from '@birdview/contracts';
import { createDataPort } from './index.js';
import { listScheduledPrincipals } from './directory.js';
export async function enumerateMaintenancePrincipals():Promise<RequestContext[]>{return listScheduledPrincipals();}
export async function listDueRoutines(){const port=createDataPort();try{const rows=[];for(const ctx of await listScheduledPrincipals()){if(!ctx.permissions.includes('*')&&!ctx.permissions.includes('read:routines'))continue;for(const routine of await port.withTenant(ctx,s=>s.list('routines',{ownerId:ctx.userId,limit:1000})))rows.push({context:ctx,routine});}return rows;}finally{await port.close();}}
