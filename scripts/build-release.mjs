import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.platform;

let command;
let args;

if (platform === "win32") {
  command = "powershell.exe";
  args = [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(rootDir, "scripts", "build-release.ps1"),
  ];
} else if (platform === "linux") {
  command = "bash";
  args = [path.join(rootDir, "scripts", "build-release.sh")];
} else {
  console.error(`The release script does not support ${platform}.`);
  process.exit(1);
}

const result = spawnSync(command, args, { cwd: rootDir, stdio: "inherit" });
if (result.error) {
  console.error(`Could not start the release script: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
