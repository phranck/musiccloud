/**
 * @file Creates the two templates a change of sign-in address needs.
 *
 * `developerEmailChangeRequested` is a required action, so without a template
 * bound to it the request fails and nothing can be changed. The notice to the
 * old address is optional, and it is seeded with it because a change nobody is
 * told about is the one worth telling somebody about.
 *
 * It creates and never overwrites: once a template exists under these names,
 * what it says is whatever was last written in the dashboard, and a seed that
 * reasserted itself would undo somebody's edit on the next deployment.
 *
 * Run against the local database, then against the deployed one:
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> pnpm tsx src/scripts/seed-email-change-templates.ts
 *   DATABASE_URL=<target> pnpm tsx src/scripts/seed-email-change-templates.ts --apply
 */

import { EmailAction } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import * as pgModule from "pg";

/** One template to create, and the action it answers. */
interface SeedTemplate {
  /** What the dashboard lists it as. */
  name: string;
  /** The subject line. */
  subject: string;
  /** The blocks, in the shape the renderer reads. */
  blocks: unknown[];
  /** The action this is bound to. */
  actionKey: string;
  /** A stable binding id, so a second run recognises its own work. */
  bindingId: string;
}

const TEMPLATES: readonly SeedTemplate[] = [
  {
    name: "Developer sign-in address change",
    subject: "Confirm your new musiccloud sign-in address",
    blocks: [
      {
        type: "text",
        markdown:
          "## Confirm this address\n\nHello {{username}}, somebody asked to sign in to musiccloud with {{newEmail}}. Confirming here makes it the address you sign in with, and the only one that receives a password reset.",
      },
      { type: "button", url: "{{confirmUrl}}", label: "Confirm this address" },
      {
        type: "text",
        markdown:
          "The link works once and expires in 24 hours. Until you follow it, nothing changes and your previous address keeps working. If this was not you, ignore this message.",
      },
    ],
    actionKey: EmailAction.DeveloperEmailChangeRequested,
    bindingId: "seed-developer-email-change",
  },
  {
    name: "Developer sign-in address change, notice",
    subject: "A change to your musiccloud sign-in address was requested",
    blocks: [
      {
        type: "text",
        markdown:
          "## Somebody asked to move your sign-in address\n\nHello {{username}}, a change to {{newEmail}} was requested for your musiccloud developer account. Nothing has changed yet: it takes a confirmation from that address.",
      },
      {
        type: "text",
        markdown:
          "If this was you, there is nothing to do here. If it was not, change your password now, because whoever asked knew it.",
      },
    ],
    actionKey: EmailAction.DeveloperEmailChangeNotified,
    bindingId: "seed-developer-email-change-notice",
  },
];

/**
 * Creates one template and binds it, where it is not there yet.
 *
 * @param client - A connected client.
 * @param template - What to create.
 * @param apply - Whether to write, as opposed to reporting.
 * @returns What happened, for the run's report.
 */
async function seedTemplate(client: pgModule.Client, template: SeedTemplate, apply: boolean): Promise<string> {
  const { rows: bound } = await client.query<{ count: string }>(
    "select count(*)::text as count from email_action_bindings where action_key = $1 and enabled = true",
    [template.actionKey],
  );
  if (Number(bound[0]?.count ?? "0") > 0) return `${template.actionKey}: already bound`;
  if (!apply) return `${template.actionKey}: would create "${template.name}" and bind it`;

  await client.query("begin");
  try {
    const { rows } = await client.query<{ id: number }>(
      "insert into email_templates (name, subject, blocks) values ($1, $2, $3::jsonb) returning id",
      [template.name, template.subject, JSON.stringify(template.blocks)],
    );
    await client.query(
      "insert into email_action_bindings (id, action_key, template_id, enabled) values ($1, $2, $3, true)",
      [template.bindingId || nanoid(), template.actionKey, rows[0].id],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  return `${template.actionKey}: created "${template.name}" and bound it`;
}

/**
 * Reports what is missing, and creates it when asked.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[seed-email-change-templates] DATABASE_URL is not set.");
    process.exit(1);
  }

  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const template of TEMPLATES) {
      console.log(`[seed-email-change-templates] ${await seedTemplate(client, template, apply)}`);
    }
    if (!apply) console.log("[seed-email-change-templates] pass --apply to write them.");
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("seed-email-change-templates.ts")) {
  main().catch((error) => {
    console.error("[seed-email-change-templates]", error);
    process.exit(1);
  });
}

export { TEMPLATES };
