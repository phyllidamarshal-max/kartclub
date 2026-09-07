import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, PORT: process.env.PONS_PORT || "2567" },
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
    { stdio: "inherit" },
  ),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 250);
}
for (const child of children) child.on("exit", (code) => close(code ?? 0));
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
