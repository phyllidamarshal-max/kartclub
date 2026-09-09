process.env.NODE_ENV = "production";
process.env.SERVE_CLIENT = "1";
await import("tsx/esm");
await import("../server/index.ts");
