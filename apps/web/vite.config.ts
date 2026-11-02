import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({base:'/app/',esbuild:{jsx:'automatic'},plugins:[tailwindcss()],server:{port:5174,host:'0.0.0.0',proxy:{'/api':'http://127.0.0.1:3001','/health':'http://127.0.0.1:3001'}},build:{sourcemap:false,chunkSizeWarningLimit:700,rollupOptions:{output:{manualChunks:{react:['react','react-dom','react-router-dom'],'charts':['recharts']}}}}});
