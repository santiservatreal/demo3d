import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/platform/**/*.test.ts'],fileParallelism:false,pool:'forks',testTimeout:45000,hookTimeout:60000,reporters:['default']}});
