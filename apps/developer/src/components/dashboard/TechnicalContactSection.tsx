import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ContentCard } from "@/components/docs/ContentCard";
import { sendAuth } from "@/lib/authClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import { SmsIcon } from "@/lib/icons";

/**
 * Props for {@link TechnicalContactSection}.
 */
export interface TechnicalContactSectionProps {
  /** The address currently on file, or `null` when none is set. */
  technicalContactEmail: string | null;
}

/**
 * Dashboard card for the account's technical contact address.
 *
 * The field exists so the operator can reach somebody who can act when an
 * application on this account misbehaves or something operational changes. It
 * is optional, and it is not verified, so the copy says both rather than
 * letting a developer assume it can receive a password reset. Clearing the
 * field removes the address.
 *
 * @param props - See {@link TechnicalContactSectionProps}.
 * @returns The contact card.
 */
export function TechnicalContactSection({ technicalContactEmail }: TechnicalContactSectionProps) {
  const [value, setValue] = useState(technicalContactEmail ?? "");
  // What a save put on file, or `null` while this page has saved nothing. The
  // prop is what the server had when the page rendered, so it stays the answer
  // until a save replaces it.
  const [savedHere, setSavedHere] = useState<{ email: string | null } | null>(null);
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [error, setError] = useState<string | null>(null);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setPhase(FormPhase.Idle);
    setError(null);
  }, []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPhase(FormPhase.Submitting);
      setError(null);

      const trimmed = value.trim();
      const result = await sendAuth("PATCH", ENDPOINTS.dev.auth.profile, {
        technicalContactEmail: trimmed === "" ? null : trimmed,
      });

      if (result.ok) {
        setSavedHere({ email: trimmed === "" ? null : trimmed });
        setPhase(FormPhase.Success);
        return;
      }

      setPhase(FormPhase.Error);
      setError(result.message ?? "Something went wrong. Please try again.");
    },
    [value],
  );

  const onFile = savedHere ? savedHere.email : technicalContactEmail;

  return (
    <ContentCard>
      <ContentCard.Header>
        <ContentCard.Header.Icon>
          <SmsIcon aria-hidden="true" />
        </ContentCard.Header.Icon>
        <ContentCard.Header.Title>Technical contact</ContentCard.Header.Title>
      </ContentCard.Header>
      <form onSubmit={onSubmit} noValidate>
        <ContentCard.Body>
          <ContentCard.Body.Copy>
            <p className="text-body text-fg-muted">
              Where we write when one of your applications needs someone who can act: a rate limit that keeps tripping,
              a breaking change to an endpoint you call, or an incident affecting your integration. A shared engineering
              address works better than a personal one, because it outlives whoever set it up.
            </p>
            <p className="text-body text-fg-muted">
              Only the operator of musiccloud reads it. It is optional, and we do not verify it, so we never send
              anything to it that only you may read. Your sign-in address stays{" "}
              <span className="text-fg">the one you log in with</span> and is the only address that receives password
              resets.
            </p>
            <TextField
              className="field--third"
              name="technicalContactEmail"
              label="Technical contact address"
              type="email"
              value={value}
              onChange={onChange}
              autoComplete="email"
              required={false}
              hint={onFile ? `Currently ${onFile}. Unverified.` : "Optional. None set."}
              error={error ?? undefined}
            />
          </ContentCard.Body.Copy>
        </ContentCard.Body>
        <ContentCard.Footer>
          <SubmitButton loading={phase === FormPhase.Submitting}>
            {phase === FormPhase.Success ? "Saved" : "Save contact"}
          </SubmitButton>
        </ContentCard.Footer>
      </form>
    </ContentCard>
  );
}
