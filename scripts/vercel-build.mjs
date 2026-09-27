import { spawnSync } from "node:child_process";

function runPnpm(args, env = process.env) {
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `pnpm ${args.join(" ")} exited with status ${result.status}`
    );
}

const owner = (process.env.VERCEL_GIT_REPO_OWNER || "").toLowerCase();
const repository = (process.env.VERCEL_GIT_REPO_SLUG || "").toLowerCase();
const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
const isThisProductionDemo =
  process.env.VERCEL_ENV === "production" &&
  process.env.VERCEL_PROJECT_ID === "prj_A0CgPvjbn5rxJExBYbCYhoqzHEyQ" &&
  owner === "khaleesisaithe" &&
  repository === "delivery-demo" &&
  branch === "main";

if (isThisProductionDemo) {
  console.log(
    "Verified demo production deploy: seeding the sample menu only if the catalog is empty."
  );
  console.log(
    "The demo store is opened only after its first sample catalog is seeded; no sample orders are created."
  );
  console.log(
    "Applying reviewed, additive Drizzle migrations to this demo's production database."
  );
  runPnpm(["db:migrate"], {
    ...process.env,
    DATABASE_SSL: "true",
    DB_CONNECTION_LIMIT: "1",
  });
  runPnpm(["db:seed:demo"], {
    ...process.env,
    DATABASE_SSL: "true",
    DB_CONNECTION_LIMIT: "1",
    SEED_DEMO_STORE_OPEN: "true",
  });
} else {
  console.log(
    "Demo catalog bootstrap skipped (not the verified production deployment of Khaleesisaithe/Delivery-demo)."
  );
}

runPnpm(["build"]);
