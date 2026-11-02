import { createApp } from './app.js';
const app=await createApp();
await app.listen({port:Number(process.env.API_PORT||3001),host:'0.0.0.0'});
console.log(`Bird View API running on port ${Number(process.env.API_PORT||3001)}.`);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>void app.close().then(()=>process.exit(0)));
