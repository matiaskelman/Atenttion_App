// Clears ELECTRON_RUN_AS_NODE so Electron initializes as a proper GUI app,
// not as a Node.js runtime. This var is set in many IDE environments.
delete process.env.ELECTRON_RUN_AS_NODE

const { spawnSync } = require('child_process')
const path = require('path')

const result = spawnSync('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..'),
  shell: true
})

process.exit(result.status || 0)
