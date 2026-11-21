// Android build-tools helpers that never use a shell: a path with spaces (the Workspace folder has them) stays one argument.
// apksigner.bat is only `java -jar lib/apksigner.jar`, so the jar is run directly with the JDK from JAVA_HOME (or the one on PATH).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function findBuildTools(env = process.env, wanted) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT is not set');
  const root = path.join(sdk, 'build-tools');
  if (!fs.existsSync(root)) throw new Error(`Android build-tools folder not found: ${root}`);
  const exe = process.platform === 'win32' ? '.exe' : '';
  const versions = fs.readdirSync(root)
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of wanted ? [wanted] : versions) {
    const dir = path.join(root, version);
    const apksignerJar = path.join(dir, 'lib', 'apksigner.jar');
    const aapt2 = path.join(dir, `aapt2${exe}`);
    if (fs.existsSync(apksignerJar) && fs.existsSync(aapt2)) return { version, dir, apksignerJar, aapt2 };
  }
  throw new Error('no usable Android build-tools (apksigner.jar and aapt2) found');
}

export function javaBin(env = process.env) {
  return env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
}

function run(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

export const runApksigner = (tools, args, env = process.env) => run(javaBin(env), ['-jar', tools.apksignerJar, ...args]);
export const runAapt2 = (tools, args) => run(tools.aapt2, args);

// Windows ships bsdtar as System32\tar.exe, which reads zip/apk. A `tar` found on PATH may be Git's GNU tar, which cannot, so the full path is used there.
export function extractZip(archive, destination, env = process.env) {
  fs.mkdirSync(destination, { recursive: true });
  const tar = process.platform === 'win32' ? path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const result = run(tar, ['-xf', archive, '-C', destination]);
  if (result.status !== 0) throw new Error(`could not extract ${path.basename(archive)}: ${result.stderr.trim() || 'tar failed'}`);
}
