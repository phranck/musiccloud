import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const deployScript = new URL("./zerops-deploy.sh", import.meta.url);

test("retries a Zerops websocket transport close before failing the deployment", async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "musiccloud-zerops-deploy-"));
  const fakeZcli = join(fixtureDirectory, "zcli");
  const attemptFile = join(fixtureDirectory, "attempts");

  try {
    await writeFile(
      fakeZcli,
      `#!/usr/bin/env sh
attempts=$(cat "$ZCLI_ATTEMPT_FILE" 2>/dev/null || printf '0')
attempts=$((attempts + 1))
printf '%s' "$attempts" > "$ZCLI_ATTEMPT_FILE"

if [ "$attempts" -eq 1 ]; then
  printf '%s\\n' 'build logs error: websocket: close sent' >&2
  exit 1
fi
`,
    );
    await chmod(fakeZcli, 0o755);

    await execFile(deployScript.pathname, ["service-id"], {
      env: {
        ...process.env,
        PATH: `${fixtureDirectory}:${process.env.PATH}`,
        ZCLI_ATTEMPT_FILE: attemptFile,
        ZEROPS_DEPLOY_MAX_ATTEMPTS: "2",
        ZEROPS_DEPLOY_RETRY_DELAY_SECONDS: "0",
      },
    });

    assert.equal(await readFile(attemptFile, "utf8"), "2");
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});
