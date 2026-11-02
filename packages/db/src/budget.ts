import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@birdview/contracts';
import { DomainError } from '@birdview/contracts';
import { Pool,type PoolClient } from 'pg';
import { setTenantContext } from './index.js';
import { resolveJobPrincipal } from './directory.js';
let pool:Pool|undefined;
async function transaction<T>(ctx:RequestContext,fn:(c:PoolClient)=>Promise<T>){pool??=new Pool({connectionString:process.env.DATABASE_URL,max:6});const fresh=await resolveJobPrincipal(ctx);const c=await pool.connect();try{await c.query('BEGIN');await setTenantContext(c,fresh);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[fresh.organizationId]);const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const amount=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw new DomainError('INVALID_COST','El coste debe estar expresado en unidades menores enteras.');return n;};
export function createBudgetStore(){return {
 reserve:(ctx:RequestContext,input:{reservationId:string;amountMinor:number;limitMinor?:number;currency?:string})=>transaction(ctx,async c=>{
  const cost=amount(input.amountMinor),period=new Date().toISOString().slice(0,7),id=`budget-${period}`;
  await c.query('INSERT INTO budget_limits(organization_id,id,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[ctx.organizationId,id,JSON.stringify({period,limitMinor:amount(input.limitMinor??0),spentMinor:0,reservedMinor:0,currency:input.currency??'EUR'})]);
  const r=await c.query('SELECT * FROM budget_limits WHERE organization_id=$1 AND id=$2 FOR UPDATE',[ctx.organizationId,id]);const d=r.rows[0].data;
  const prior=await c.query("SELECT data FROM usage_ledger WHERE organization_id=$1 AND data->>'reservationId'=$2",[ctx.organizationId,input.reservationId]);if(prior.rows[0])return prior.rows[0].data;
  if(d.currency!==(input.currency??d.currency)||Number(d.spentMinor)+Number(d.reservedMinor)+cost>Number(d.limitMinor))throw new DomainError('BUDGET_EXHAUSTED','No hay presupuesto disponible.',402);
  await c.query("UPDATE budget_limits SET data=jsonb_set(data,'{reservedMinor}',to_jsonb($3::bigint)),version=version+1 WHERE organization_id=$1 AND id=$2",[ctx.organizationId,id,Number(d.reservedMinor)+cost]);
  const row={reservationId:input.reservationId,reservedMinor:cost,actualMinor:0,status:'reserved',period,budgetId:id,currency:d.currency};await c.query('INSERT INTO usage_ledger(organization_id,id,data) VALUES($1,$2,$3)',[ctx.organizationId,randomUUID(),JSON.stringify(row)]);return row;
 }),
 reconcile:(ctx:RequestContext,input:{reservationId:string;actualMinor:number;estimated?:boolean})=>settle(ctx,input.reservationId,amount(input.actualMinor),'settled',input.estimated??false),
 release:(ctx:RequestContext,id:string)=>settle(ctx,id,0,'released'),
};}
async function settle(ctx:RequestContext,id:string,actual:number,status:string,estimated=false){return transaction(ctx,async c=>{const rows=await c.query("SELECT * FROM usage_ledger WHERE organization_id=$1 AND data->>'reservationId'=$2 FOR UPDATE",[ctx.organizationId,id]);const row=rows.rows[0];if(!row||row.data.status!=='reserved')return;const b=await c.query('SELECT * FROM budget_limits WHERE organization_id=$1 AND id=$2 FOR UPDATE',[ctx.organizationId,row.data.budgetId]);const data=b.rows[0].data;await c.query('UPDATE budget_limits SET data=$3,version=version+1 WHERE organization_id=$1 AND id=$2',[ctx.organizationId,row.data.budgetId,JSON.stringify({...data,reservedMinor:Math.max(0,Number(data.reservedMinor)-Number(row.data.reservedMinor)),spentMinor:Number(data.spentMinor)+actual})]);await c.query('UPDATE usage_ledger SET data=$3 WHERE organization_id=$1 AND id=$2',[ctx.organizationId,row.id,JSON.stringify({...row.data,status,actualMinor:actual,estimated})]);});}
export async function closeBudgetPool(){if(pool){await pool.end();pool=undefined;}}
