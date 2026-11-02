import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const literal = (value:string) => `'${value.replaceAll("'","''")}'`;
export async function migrate(options: { migrationUrl?: string; runtimePassword?:string; authPassword?:string; vaultPassword?:string } = {}) {
  const url=options.migrationUrl??process.env.MIGRATION_DATABASE_URL;
  if(!url) throw new Error('MIGRATION_DATABASE_URL is required.');
  const pool=new Pool({connectionString:url,max:1});
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS public.birdview_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const path=fileURLToPath(new URL('../migrations/',import.meta.url));
    for(const name of (await readdir(path)).filter(n=>n.endsWith('.sql')).sort()){
      const sql=await readFile(`${path}/${name}`,'utf8');const checksum=createHash('sha256').update(sql).digest('hex');
      const exists=await pool.query<{checksum:string}>('SELECT checksum FROM public.birdview_migrations WHERE name=$1',[name]);
      if(exists.rowCount){if(exists.rows[0].checksum!==checksum)throw new Error(`Migration checksum mismatch: ${name}`);continue;}
      const client=await pool.connect();try{await client.query('BEGIN');await client.query(sql);await client.query('INSERT INTO public.birdview_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
    for(const [role,password] of [['birdview_runtime',options.runtimePassword??process.env.RUNTIME_DB_PASSWORD],['birdview_auth',options.authPassword??process.env.AUTH_DB_PASSWORD],['birdview_vault',options.vaultPassword??process.env.VAULT_DB_PASSWORD]]) {
      if(!password) throw new Error(`A password is required for ${role}.`);
      await pool.query(`ALTER ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ${literal(password)}`);
    }
  } finally { await pool.end(); }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) migrate().then(()=>console.log('Database migrations applied.')).catch(()=>{console.error('Database migration failed. Check database access and migration state.');process.exitCode=1;});
