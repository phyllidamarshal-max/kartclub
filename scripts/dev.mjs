import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--watch", "--import", "tsx", "server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "2567", NODE_ENV: "development" },
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
    { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } },
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
