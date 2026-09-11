import { ContentCard } from "@/components/docs/ContentCard";
import { LoginIcon } from "@/lib/icons";

/**
 * Props for {@link SignInSection}.
 */
export interface SignInSectionProps {
  /** The address this account signs in with. Shown, never edited here. */
  email: string;
}

/**
 * Dashboard card for the address the account signs in with.
 *
 * Read-only on purpose: changing it is an identity change rather than a
 * profile edit, and it is the only address that receives a password reset.
 * What a developer may change about how they appear lives on its own card.
 *
 * @param props - See {@link SignInSectionProps}.
 * @returns The sign-in card.
 */
export function SignInSection({ email }: SignInSectionProps) {
  return (
    <ContentCard className="mb-6">
      <ContentCard.Header>
        <ContentCard.Header.Icon>
          <LoginIcon aria-hidden="true" />
        </ContentCard.Header.Icon>
        <ContentCard.Header.Title>Sign-in</ContentCard.Header.Title>
      </ContentCard.Header>
      <ContentCard.Body>
        <ContentCard.Body.Copy>
          <dl className="grid grid-cols-1 gap-y-1">
            <dt className="text-body text-fg-muted">Email</dt>
            <dd className="text-body text-fg">{email}</dd>
          </dl>
          <p className="text-body text-fg-muted">
            Your sign-in address cannot be changed here, because it is the one address that receives a password reset.
          </p>
        </ContentCard.Body.Copy>
      </ContentCard.Body>
    </ContentCard>
  );
}
