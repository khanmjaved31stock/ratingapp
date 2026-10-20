const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");

const projectRoot = path.resolve(__dirname, "..");
const dataDirectory = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "Ratewell",
  "mongodb-data",
);

let database;
let nextProcess;
let stopping = false;

async function stopLocalServices(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  if (nextProcess && nextProcess.exitCode === null) {
    nextProcess.kill("SIGTERM");
  }
  if (database) {
    await database.stop();
  }
  process.exit(exitCode);
}

async function start() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  database = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [
      {
        dbPath: dataDirectory,
        port: Number(process.env.LOCAL_MONGODB_PORT || 27017),
      },
    ],
    binary: {
      version: process.env.LOCAL_MONGODB_VERSION || "8.0.12",
    },
  });

  const env = {
    ...process.env,
    MONGODB_URI: database.getUri("rating_portal"),
  };
  const nextCli = path.join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );

  console.log(`Local MongoDB is ready. Persistent data: ${dataDirectory}`);
  nextProcess = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", "127.0.0.1", "--port", process.env.PORT || "3000"],
    { cwd: projectRoot, env, stdio: "inherit" },
  );

  nextProcess.on("error", (error) => {
    console.error("Could not start Next.js:", error);
    void stopLocalServices(1);
  });
  nextProcess.on("exit", (code, signal) => {
    if (!stopping) {
      console.log(`Next.js stopped${signal ? ` (${signal})` : ""}.`);
      void stopLocalServices(code || 0);
    }
  });
}

process.on("SIGINT", () => void stopLocalServices(0));
process.on("SIGTERM", () => void stopLocalServices(0));

start().catch((error) => {
  console.error("Local MongoDB startup failed:", error);
  void stopLocalServices(1);
});
