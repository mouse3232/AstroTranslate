const { execSync } = require('child_process');
const { renameSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const rustInfo = execSync('rustc -vV').toString();
const targetTriple = rustInfo.split('\n').find(line => line.startsWith('host:')).split(' ')[1];
const ext = process.platform === 'win32' ? '.exe' : '';
const sidecar_name = 'server';
const sidecar_binary_name = `${sidecar_name}-${targetTriple}${ext}`;
const binaries_dir = join(process.cwd(), 'src-tauri', 'binaries');
const sidecar_output_path = join(binaries_dir, sidecar_binary_name);

if (!existsSync(binaries_dir)) {
    mkdirSync(binaries_dir, { recursive: true });
}

execSync(`npx pkg server.cjs --out-path ${binaries_dir} --targets node18-${process.platform}-x64`);

renameSync(join(binaries_dir, `server${ext}`), sidecar_output_path);

console.log(`Sidecar binary moved to ${sidecar_output_path}`);
