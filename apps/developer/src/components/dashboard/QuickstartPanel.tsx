import { useState } from "react";
import { CopyableCode } from "@/components/dashboard/CopyableCode";
import { API_KEY_ENV_NAME, API_KEY_HEADER, firstRequestSnippets, keylessNote } from "@/lib/quickstart";

/**
 * Props for {@link QuickstartPanel}.
 */
export interface QuickstartPanelProps {
  /** The registration the key belongs to, so the snippet is about something. */
  registrationName: string;
  /** The registration's public client id, which identifies but does not authenticate. */
  publicClientId: string;
}

/**
 * The first authenticated request, shown where the key is handed over.
 *
 * A developer who has just been given a key otherwise has to leave for the API
 * reference, which is a different surface with a different structure and no
 * knowledge of what they just created. This closes that gap in the same flow.
 *
 * The snippet never carries the key. It reads it from the environment, because
 * a command with a credential in it lands in a shell history and a file with
 * one in it lands in a repository.
 *
 * @param props - See {@link QuickstartPanelProps}.
 * @returns The quickstart.
 */
export function QuickstartPanel({ registrationName, publicClientId }: QuickstartPanelProps) {
  const snippets = firstRequestSnippets();
  const [selectedId, setSelectedId] = useState(snippets[0]?.id ?? "");
  const selected = snippets.find((snippet) => snippet.id === selectedId) ?? snippets[0];
  const keyless = keylessNote();

  return (
    <section className="flex flex-col gap-3 mt-3" data-quickstart>
      <h3 className="text-body font-medium text-fg">Your first request</h3>
      <p className="text-nav text-fg-subtle">
        Put the key you just copied into <code className="text-code-fg">{API_KEY_ENV_NAME}</code>, then send it as{" "}
        <code className="text-code-fg">{API_KEY_HEADER}</code>. This calls an endpoint that needs the key, so a
        successful answer proves the key works for {registrationName}.
      </p>

      <div className="flex gap-2" role="tablist" aria-label="Quickstart language">
        {snippets.map((snippet) => (
          <button
            key={snippet.id}
            type="button"
            role="tab"
            aria-selected={snippet.id === selected?.id}
            onClick={() => setSelectedId(snippet.id)}
            className={`button text-body ${snippet.id === selected?.id ? "button--secondary" : "button--subtle"}`}
          >
            {snippet.label}
          </button>
        ))}
      </div>

      {selected && <CopyableCode code={selected.code} label={`the ${selected.label} snippet`} multiline />}

      <p className="text-nav text-fg-subtle">
        Your client id is <code className="text-code-fg">{publicClientId}</code>. It identifies this application and
        does not authenticate it, so it is safe to publish and it is not sent instead of the key.
      </p>

      <p className="text-nav text-fg-subtle">{keyless.text}</p>

      <p className="text-nav text-fg-subtle">
        Language packages are not published yet, so this shows plain HTTP. Every operation, its parameters and its
        errors are in the{" "}
        <a href="/docs/api" className="content-link">
          API reference
        </a>
        .
      </p>
    </section>
  );
}
