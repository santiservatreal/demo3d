import { createHash,randomBytes } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createDemoEntities } from './dataset.js';
import { createAuth } from '@birdview/auth';
import { closeDirectoryPool } from '@birdview/db';
import type { Role } from '@birdview/contracts';

export const fixtureId=(key:string)=>createHash('sha256').update(`birdview-demo-v1:${key}`).digest('hex').slice(0,32);
export interface DemoUser {id:string;name:string;email:string;password:string;role:Role;organizationIds:string[];}
export async function seedDemo(options:{referenceDate?:string}={}) {
 if(process.env.APP_PROFILE!=='demo'||process.env.NODE_ENV==='production')throw new Error('Demo seed is disabled outside the local demo profile.');
 const now=new Date(options.referenceDate||process.env.DEMO_REFERENCE_DATE||Date.now());if(!Number.isFinite(now.getTime()))throw new Error('Invalid demo reference date');
 const pool=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1}),auth=createAuth();
 const orgs=[{id:fixtureId('brisa'),name:'Brisa Servicios Demo',template:'services',modules:['sales','finance','people','support']},{id:fixtureId('norte'),name:'Norte Industrial Demo',template:'industrial',modules:['sales','finance','people','support','operations','inventory','logistics']}];
 let users:DemoUser[]=[];try{users=JSON.parse(await readFile(process.env.DEMO_USERS_FILE||'.local/demo-users.json','utf8'));}catch{/* first explicit seed */}
 try {
  for(const [i,role] of (['owner','admin','manager','analyst','reader'] as Role[]).entries()) {
   const email=`birdview.demo.${role}@example.com`;let user=users.find(u=>u.email===email);
   if(!user){const password=randomBytes(24).toString('base64url');const name=['Alex Demo','Noa Técnica','Lucía Responsable','Diego Analista','Eva Lectura'][i];const result=await auth.api.signUpEmail({body:{email,password,name}});user={id:result.user.id,email,password,name,role,organizationIds:role==='owner'?[orgs[0].id,orgs[1].id]:[orgs[0].id]};users.push(user);}
  }
  const c=await pool.connect();try{await c.query('BEGIN');
   for(const organization of orgs){await c.query('INSERT INTO organizations(id,name,template,currency,timezone,modules,demo) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(id) DO NOTHING',[organization.id,organization.name,organization.template,'EUR','Europe/Madrid',organization.modules]);
    for(const user of users.filter(u=>u.organizationIds.includes(organization.id)))await c.query('INSERT INTO memberships(id,organization_id,user_id,role,department_ids) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,user_id) DO NOTHING',[fixtureId(`member:${organization.id}:${user.id}`),organization.id,user.id,user.role,user.role==='owner'?['*']:user.role==='admin'?['sales']:user.role==='manager'?['sales','support']:['sales','finance','people','support']]);
    if((await c.query('SELECT deleted_at FROM organizations WHERE id=$1',[organization.id])).rows[0]?.deleted_at)continue;
    const exists=await c.query('SELECT id FROM accounts WHERE organization_id=$1 LIMIT 1',[organization.id]);if(exists.rowCount)continue;
    for(const row of createDemoEntities(organization,users[0].id,now,fixtureId))await c.query(`INSERT INTO public.${row.kind}(organization_id,id,department_id,owner_id,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[row.organizationId,row.id,row.departmentId,row.ownerId,JSON.stringify(row.data)]);
   }
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  await mkdir('.local',{recursive:true,mode:0o700});await writeFile(process.env.DEMO_USERS_FILE||'.local/demo-users.json',JSON.stringify(users,null,2),{mode:0o600});return {organizations:orgs.map(o=>({id:o.id,name:o.name})),users:users.map(u=>({id:u.id,role:u.role}))};
 }finally{await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))seedDemo().then(()=>console.log('Persistent demo initialized. Credentials are in the private .local/demo-users.json file.')).catch(()=>{console.error('Demo initialization failed. Inspect configuration and migration status.');process.exitCode=1;}).finally(closeDirectoryPool);
