import { betterAuth } from 'better-auth';
import { getDirectoryPool } from '@birdview/db';
export function createAuth() {
  if(process.env.NODE_ENV==='production'&&process.env.MIGRATION_DATABASE_URL)throw new Error('The server must not receive migration credentials.');
  if (!process.env.BETTER_AUTH_SECRET) throw new Error('Authentication secret is required.');
  return betterAuth({
    database: getDirectoryPool(), secret: process.env.BETTER_AUTH_SECRET,
    baseURL:process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3001',
    trustedOrigins:[process.env.APP_ORIGIN || 'http://127.0.0.1:5174',process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3001'],
    emailAndPassword:{enabled:true,minPasswordLength:12},
    session:{expiresIn:60*60*24*7,updateAge:60*60,additionalFields:{activeOrganizationId:{type:'string',required:false,input:false}}},
    advanced:{cookiePrefix:'birdview',useSecureCookies:process.env.NODE_ENV==='production'},
    rateLimit:{enabled:true,window:60,max:30},
    logger:{disabled:true},
  });
}
export type BirdAuth = ReturnType<typeof createAuth>;
