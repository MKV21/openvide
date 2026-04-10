import * as child_process from "node:child_process";
import * as dns from "node:dns/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDeployScaffold, type DeployProxy, type DeployScaffoldOptions } from "./deployScaffold.js";

export interface DeployDoctorCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  hint?: string;
}

export interface DeployDoctorOptions extends DeployScaffoldOptions {}

export interface DeployDoctorResult {
  ok: boolean;
  checks: DeployDoctorCheck[];
  rootDir: string;
  publicOrigin: string;
}

export interface DeploySetupOptions extends DeployScaffoldOptions {
  dryRun?: boolean;
  issueToken?: boolean;
  tokenExpire?: string;
}

export interface DeploySetupResult {
  rootDir: string;
  files: string[];
  publicOrigin: string;
  daemonHome: string;
  bridgePort: number;
  bindHost: string;
  serviceName: string;
  daemonUser: string;
  steps: string[];
  token?: string;
}

function commandExists(command: string): boolean {
  try {
    child_process.execFileSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function canUseSudo(): boolean {
  return isRoot() || commandExists("sudo");
}

function userHomeFor(daemonUser: string): string {
  if (daemonUser === "root") return "/root";
  if (daemonUser === os.userInfo().username) return os.homedir();
  try {
    const home = child_process.execFileSync("sh", ["-lc", `getent passwd ${shellEscapeForSh(daemonUser)} | cut -d: -f6`], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (home) return home;
  } catch {
    // Fall back to conventional Linux home path.
  }
  return `/home/${daemonUser}`;
}

function shellEscapeForSh(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function publicOriginFor(opts: DeployScaffoldOptions): string {
  return opts.publicOrigin
    ?? (opts.domain ? `https://${opts.domain}` : `https://YOUR_HOST:${opts.bridgePort}`);
}

function runCommand(command: string, args: string[], opts?: { dryRun?: boolean; sudo?: boolean }): void {
  if (opts?.dryRun) return;
  if (opts?.sudo && !isRoot()) {
    child_process.execFileSync("sudo", [command, ...args], { stdio: "inherit" });
    return;
  }
  child_process.execFileSync(command, args, { stdio: "inherit" });
}

function runCommandCapture(command: string, args: string[], opts?: { sudo?: boolean }): string {
  if (opts?.sudo && !isRoot()) {
    return child_process.execFileSync("sudo", [command, ...args], { encoding: "utf-8" }).trim();
  }
  return child_process.execFileSync(command, args, { encoding: "utf-8" }).trim();
}

function installFile(source: string, target: string, mode: number, dryRun = false): void {
  const octalMode = mode.toString(8);
  if (dryRun) return;
  if (isRoot()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    fs.chmodSync(target, mode);
    return;
  }
  runCommand("install", ["-D", "-m", octalMode, source, target], { sudo: true });
}

function writeRootFile(target: string, content: string, mode: number, dryRun = false): void {
  if (dryRun) return;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openvide-deploy-"));
  const tempFile = path.join(tempDir, path.basename(target));
  fs.writeFileSync(tempFile, content, "utf-8");
  installFile(tempFile, target, mode, false);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function readMaybeRootFile(target: string): string {
  if (isRoot()) {
    try {
      return fs.readFileSync(target, "utf-8");
    } catch {
      return "";
    }
  }
  try {
    return runCommandCapture("cat", [target], { sudo: true });
  } catch {
    return "";
  }
}

function ensureDirectory(target: string, dryRun = false): void {
  if (dryRun) return;
  if (isRoot()) {
    fs.mkdirSync(target, { recursive: true });
    return;
  }
  runCommand("mkdir", ["-p", target], { sudo: true });
}

function ensureCaddyImport(dryRun = false): void {
  if (dryRun) return;
  const caddyfilePath = "/etc/caddy/Caddyfile";
  const importLine = "import /etc/caddy/Caddyfile.d/*";
  const existing = readMaybeRootFile(caddyfilePath);
  const trimmed = existing.trim();
  if (existing.includes(importLine)) return;
  const next = trimmed ? `${existing.replace(/\s*$/, "")}\n\n${importLine}\n` : `${importLine}\n`;
  writeRootFile(caddyfilePath, next, 0o644, dryRun);
}

function installCaddyConfig(serviceName: string, source: string, dryRun = false): void {
  ensureDirectory("/etc/caddy/Caddyfile.d", dryRun);
  installFile(source, `/etc/caddy/Caddyfile.d/${serviceName}.caddy`, 0o644, dryRun);
  ensureCaddyImport(dryRun);
}

function installNginxConfig(serviceName: string, source: string, dryRun = false): void {
  const available = `/etc/nginx/sites-available/${serviceName}.conf`;
  const enabled = `/etc/nginx/sites-enabled/${serviceName}.conf`;
  installFile(source, available, 0o644, dryRun);
  if (dryRun) return;
  if (isRoot()) {
    fs.mkdirSync(path.dirname(enabled), { recursive: true });
    try { fs.unlinkSync(enabled); } catch { /* ignore */ }
    fs.symlinkSync(available, enabled);
    return;
  }
  runCommand("mkdir", ["-p", "/etc/nginx/sites-enabled"], { sudo: true });
  runCommand("ln", ["-sfn", available, enabled], { sudo: true });
}

function ensureProxyInstalled(proxy: DeployProxy, dryRun = false): void {
  if (proxy === "none") return;
  if (dryRun) return;
  const binary = proxy === "caddy" ? "caddy" : "nginx";
  if (commandExists(binary)) return;
  if (!commandExists("apt-get")) {
    throw new Error(`${binary} is not installed and apt-get is unavailable. Install ${binary} manually or use deploy scaffold.`);
  }
  runCommand("apt-get", ["update"], { sudo: true });
  runCommand("apt-get", ["install", "-y", binary], { sudo: true });
}

function ensureSystemdAvailable(): void {
  if (!commandExists("systemctl")) {
    throw new Error("systemctl is not available on this host");
  }
}

function cliScriptPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "cli.js");
}

function runOpenVideJsonAsUser(daemonUser: string, args: string[], dryRun = false): Record<string, unknown> {
  if (dryRun) return { ok: true };
  const home = userHomeFor(daemonUser);
  const cliPath = cliScriptPath();

  let cmd = process.execPath;
  let cmdArgs = [cliPath, ...args];
  let env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    OPENVIDE_DAEMON_HOME: path.join(home, ".openvide-daemon"),
  };

  if (daemonUser !== os.userInfo().username) {
    if (isRoot() && commandExists("runuser")) {
      cmd = "runuser";
      cmdArgs = ["-u", daemonUser, "--", process.execPath, cliPath, ...args];
      env = { ...process.env, HOME: home, OPENVIDE_DAEMON_HOME: path.join(home, ".openvide-daemon") };
    } else if (canUseSudo()) {
      cmd = "sudo";
      cmdArgs = ["-u", daemonUser, "-H", process.execPath, cliPath, ...args];
      env = { ...process.env };
    } else {
      throw new Error(`Need root, runuser, or sudo to run daemon commands as ${daemonUser}`);
    }
  }

  const stdout = child_process.execFileSync(cmd, cmdArgs, {
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();

  return stdout ? JSON.parse(stdout) as Record<string, unknown> : { ok: true };
}

async function resolveDomain(domain: string): Promise<boolean> {
  try {
    const a = await dns.resolve(domain);
    return Array.isArray(a) && a.length > 0;
  } catch {
    return false;
  }
}

export async function runDeployDoctor(opts: DeployDoctorOptions): Promise<DeployDoctorResult> {
  const checks: DeployDoctorCheck[] = [];

  checks.push({
    id: "platform",
    status: process.platform === "linux" ? "pass" : "warn",
    message: process.platform === "linux"
      ? "Linux host detected"
      : "This flow is optimized for Linux VPS hosts",
    hint: process.platform === "linux" ? undefined : "The generated files still work, but automatic setup assumes Linux/systemd paths.",
  });

  checks.push({
    id: "systemd",
    status: commandExists("systemctl") ? "pass" : "fail",
    message: commandExists("systemctl") ? "systemd is available" : "systemd is missing",
    hint: commandExists("systemctl") ? undefined : "Use a Linux VPS with systemd or fall back to deploy scaffold only.",
  });

  checks.push({
    id: "sudo",
    status: canUseSudo() ? "pass" : "warn",
    message: canUseSudo() ? "Administrative escalation is available" : "sudo/root access not detected",
    hint: canUseSudo() ? undefined : "You can still generate files, but system service and proxy installation will need manual root access.",
  });

  const proxyBinary = opts.proxy === "caddy" ? "caddy" : opts.proxy === "nginx" ? "nginx" : null;
  if (proxyBinary) {
    checks.push({
      id: "proxy",
      status: commandExists(proxyBinary) ? "pass" : commandExists("apt-get") ? "warn" : "fail",
      message: commandExists(proxyBinary)
        ? `${proxyBinary} is installed`
        : `${proxyBinary} is not installed yet`,
      hint: commandExists(proxyBinary)
        ? undefined
        : commandExists("apt-get")
          ? `deploy setup can install ${proxyBinary} automatically via apt-get`
          : `Install ${proxyBinary} manually before running deploy setup`,
    });
  }

  if (opts.proxy !== "none" && opts.domain) {
    const resolves = await resolveDomain(opts.domain);
    checks.push({
      id: "dns",
      status: resolves ? "pass" : "warn",
      message: resolves
        ? `${opts.domain} resolves in DNS`
        : `${opts.domain} does not resolve yet`,
      hint: resolves ? undefined : "Point your A/AAAA record to the VPS before expecting public HTTPS to work.",
    });
  }

  const scaffold = generateDeployScaffold(opts);
  const ok = checks.every((check) => check.status !== "fail");
  return {
    ok,
    checks,
    rootDir: scaffold.rootDir,
    publicOrigin: publicOriginFor(opts),
  };
}

export function runDeploySetup(opts: DeploySetupOptions): DeploySetupResult {
  if (!opts.dryRun) {
    ensureSystemdAvailable();
  }

  const scaffold = generateDeployScaffold(opts);
  const steps: string[] = [];
  const serviceTarget = `/etc/systemd/system/${opts.serviceName}.service`;

  installFile(path.join(scaffold.rootDir, "systemd", `${opts.serviceName}.service`), serviceTarget, 0o644, opts.dryRun);
  steps.push(`Installed systemd unit to ${serviceTarget}`);

  runCommand("systemctl", ["daemon-reload"], { sudo: true, dryRun: opts.dryRun });
  steps.push("Reloaded systemd");

  runCommand("systemctl", ["enable", "--now", opts.serviceName], { sudo: true, dryRun: opts.dryRun });
  steps.push(`Enabled and started ${opts.serviceName}`);

  ensureProxyInstalled(opts.proxy, opts.dryRun);
  if (opts.proxy === "caddy") {
    installCaddyConfig(opts.serviceName, path.join(scaffold.rootDir, "proxy", "Caddyfile"), opts.dryRun);
    steps.push("Installed Caddy config");
    runCommand("systemctl", ["reload", "caddy"], { sudo: true, dryRun: opts.dryRun });
    steps.push("Reloaded Caddy");
  } else if (opts.proxy === "nginx") {
    installNginxConfig(opts.serviceName, path.join(scaffold.rootDir, "proxy", "openvide.conf"), opts.dryRun);
    steps.push("Installed nginx site config");
    runCommand("nginx", ["-t"], { sudo: true, dryRun: opts.dryRun });
    runCommand("systemctl", ["reload", "nginx"], { sudo: true, dryRun: opts.dryRun });
    steps.push("Reloaded nginx");
  }

  const enableArgs = opts.proxy === "none"
    ? ["bridge", "enable", "--port", String(opts.bridgePort)]
    : ["bridge", "enable", "--port", String(opts.bridgePort), "--no-tls"];
  runOpenVideJsonAsUser(opts.daemonUser, enableArgs, Boolean(opts.dryRun));
  steps.push("Enabled bridge runtime");

  const configArgs = ["bridge", "config", "--bind-host", opts.bindHost];
  if (opts.defaultCwd?.trim()) {
    configArgs.push("--default-cwd", opts.defaultCwd.trim());
  }
  if (opts.evenAiTool) {
    configArgs.push("--even-ai-tool", opts.evenAiTool);
  }
  if (opts.evenAiMode) {
    configArgs.push("--even-ai-mode", opts.evenAiMode);
  }
  runOpenVideJsonAsUser(opts.daemonUser, configArgs, Boolean(opts.dryRun));
  steps.push("Configured bridge defaults");

  let token: string | undefined;
  if (opts.issueToken) {
    const tokenRes = runOpenVideJsonAsUser(
      opts.daemonUser,
      ["bridge", "token", "--expire", opts.tokenExpire ?? "24h"],
      Boolean(opts.dryRun),
    );
    if (typeof tokenRes.bridgeToken === "string") {
      token = tokenRes.bridgeToken;
    }
    steps.push(`Issued bridge token (${opts.tokenExpire ?? "24h"})`);
  }

  return {
    rootDir: scaffold.rootDir,
    files: scaffold.files,
    publicOrigin: publicOriginFor(opts),
    daemonHome: path.join(userHomeFor(opts.daemonUser), ".openvide-daemon"),
    bridgePort: opts.bridgePort,
    bindHost: opts.bindHost,
    serviceName: opts.serviceName,
    daemonUser: opts.daemonUser,
    steps,
    token,
  };
}
