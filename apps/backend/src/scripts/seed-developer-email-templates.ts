/**
 * @file Creates the templates the developer portal's address change and its
 * invitations need.
 *
 * `developerEmailChangeRequested` and `developerPortalInviteSent` are required
 * actions, so without a template bound to them the request fails and nothing
 * is changed or sent. The notice to the old address is optional, and it is
 * seeded with them because a change nobody is told about is the one worth
 * telling somebody about.
 *
 * It creates and never overwrites: once an action has an enabled template,
 * what that template says is whatever was last written in the dashboard, and
 * a seed that reasserted itself would undo somebody's edit on the next
 * deployment.
 *
 * Run against the local database, then against the deployed one:
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> pnpm tsx src/scripts/seed-developer-email-templates.ts
 *   DATABASE_URL=<target> pnpm tsx src/scripts/seed-developer-email-templates.ts --apply
 */

import { EmailAction } from "@musiccloud/shared";
import { nanoid } from "nanoid";
import * as pgModule from "pg";

/** The prefix of every line this script prints, and the file name it runs under. */
const SCRIPT_NAME = "seed-developer-email-templates";

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
  /** A stable binding id, so a second run recognizes its own work. */
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
  {
    name: "Developer portal invitation",
    subject: "You are invited to the musiccloud developer portal",
    blocks: [
      {
        type: "text",
        markdown:
          "## Come in before everybody else\n\nHello {{username}}, the musiccloud developer portal is not open to everybody yet, and you are invited to use it now. Following the link lets you sign up, or sign in if you already have an account, and the access stays on that account.",
      },
      { type: "button", url: "{{inviteUrl}}", label: "Accept the invitation" },
      {
        type: "text",
        markdown:
          "The link works once and expires in 14 days. Whoever follows it first is let in, so please do not forward this message.",
      },
    ],
    actionKey: EmailAction.DeveloperPortalInviteSent,
    bindingId: "seed-developer-portal-invitation",
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
    console.error(`[${SCRIPT_NAME}] DATABASE_URL is not set.`);
    process.exit(1);
  }

  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const template of TEMPLATES) {
      console.log(`[${SCRIPT_NAME}] ${await seedTemplate(client, template, apply)}`);
    }
    if (!apply) console.log(`[${SCRIPT_NAME}] pass --apply to write them.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith(`${SCRIPT_NAME}.ts`)) {
  main().catch((error) => {
    console.error(`[${SCRIPT_NAME}]`, error);
    process.exit(1);
  });
}

export { TEMPLATES };
