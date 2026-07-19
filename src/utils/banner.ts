import type { ServiceAdapter } from "../schemas/serviceAdaptor";

// ANSI escape helpers — no dependency needed
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgCyan: "\x1b[46m",
  bgMagenta: "\x1b[45m",
};

const LOGO = `
${c.cyan}${c.bold}  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║   ███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗║
  ║   ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝║
  ║   ███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝ ║
  ║   ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  ║
  ║   ███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║   ║
  ║   ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ║
  ║                                                       ║
  ║   ${c.magenta}██████╗ ██╗   ██╗███████╗${c.cyan}                            ║
  ║   ${c.magenta}██╔══██╗██║   ██║██╔════╝${c.cyan}                            ║
  ║   ${c.magenta}██████╔╝██║   ██║███████╗${c.cyan}                            ║
  ║   ${c.magenta}██╔══██╗██║   ██║╚════██║${c.cyan}                            ║
  ║   ${c.magenta}██████╔╝╚██████╔╝███████║${c.cyan}                            ║
  ║   ${c.magenta}╚═════╝  ╚═════╝ ╚══════╝${c.cyan}                            ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝${c.reset}
`;

export function printBanner(adapters: ServiceAdapter[], port: number): void {
  console.log(LOGO);
  console.log(
    `  ${c.dim}by${c.reset} ${c.bold}${c.white}Victor Chibuogwu Chukemeka${c.reset} ${c.dim}aka${c.reset} ${c.yellow}Emekadefirst${c.reset}  ${c.dim}• July 2026${c.reset}`
  );
  console.log(
    `  ${c.dim}✉${c.reset}  ${c.cyan}emekadefirst@gmail.com${c.reset}`
  );
  console.log();
  console.log(`  ${c.cyan}${c.bold}Services in bus:${c.reset}`);
  console.log(`  ${c.dim}${"─".repeat(40)}${c.reset}`);

  for (const adapter of adapters) {
    const status = adapter.enabled
      ? `${c.green}● enabled${c.reset}`
      : `${c.dim}○ disabled${c.reset}`;
    const topics = adapter.topics.map((t) => `${c.dim}${t}${c.reset}`).join(", ");
    console.log(`  ${c.bold}${c.white}${adapter.name}${c.reset}  ${status}`);
    console.log(`    ${c.dim}→${c.reset} ${topics}`);
  }

  console.log(`  ${c.dim}${"─".repeat(40)}${c.reset}`);
  console.log();
  console.log(
    `  ${c.bgCyan}${c.bold} 🚀 LISTENING ${c.reset} ${c.green}http://localhost:${port}${c.reset}`
  );
  console.log();
}
