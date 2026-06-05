export interface StatsDeps {
  uptime: () => number;
  cpus: () => Array<{ model: string }>;
  loadAvg: () => number[];
  totalmem: () => number;
  freemem: () => number;
  models: { local: string; api: string };
  toolNames: string[];
}

export interface SystemStats {
  status: "online";
  uptimeSeconds: number;
  cpu: { model: string; cores: number; loadAvg1m: number };
  memory: { totalMB: number; freeMB: number; usedMB: number };
  models: { local: string; api: string };
  tools: number;
  toolNames: string[];
}

function bytesToMB(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

export function collectStats(deps: StatsDeps): SystemStats {
  const cpus = deps.cpus();
  const totalMB = bytesToMB(deps.totalmem());
  const freeMB = bytesToMB(deps.freemem());

  return {
    status: "online",
    uptimeSeconds: deps.uptime(),
    cpu: {
      model: cpus[0]?.model ?? "unknown",
      cores: cpus.length,
      loadAvg1m: deps.loadAvg()[0] ?? 0,
    },
    memory: {
      totalMB,
      freeMB,
      usedMB: totalMB - freeMB,
    },
    models: deps.models,
    tools: deps.toolNames.length,
    toolNames: [...deps.toolNames],
  };
}
