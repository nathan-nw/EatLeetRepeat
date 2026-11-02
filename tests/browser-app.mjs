import { spawn } from 'node:child_process';

// Use a production server: development HMR reloads can race form hydration.
const build = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { stdio: 'inherit', env: process.env });
build.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const server = spawn(process.execPath, ['--import', new URL('./fetch-fixtures.mjs', import.meta.url).href, 'node_modules/next/dist/bin/next', 'start', '--port', '3100'], { stdio: 'inherit', env: process.env });
  server.on('exit', (status) => process.exit(status ?? 0));
});
