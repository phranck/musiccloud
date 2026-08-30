import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useReducer } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ApiFailureNotice } from "@/components/dashboard/ApiFailureNotice";
import { RegistrationProfileChoice } from "@/components/dashboard/RegistrationProfileChoice";
import { RegistrationTokens } from "@/components/dashboard/RegistrationTokens";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  ApiClientStatus,
  type ApiClientStatusValue,
  createClientRegistration,
  getDeveloperProject,
  MAX_APP_NAME_LENGTH,
  updateClientRegistration,
} from "@/lib/apiAccessClient";
import { ButtonVariant } from "@/lib/buttonVariant";
import { formatDate } from "@/lib/formatDate";
import { FormPhase } from "@/lib/formPhase";
import { AddIcon } from "@/lib/icons";
import { toPanelFailure } from "@/lib/projectsPanelState";
import { registrationProfileCopy } from "@/lib/registrationProfiles";
import {
  REGISTRATIONS_PANEL_INITIAL_STATE,
  RegistrationsPanelActionType,
  registrationsPanelReducer,
} from "@/lib/registrationsPanelState";

/**
 * Props for {@link RegistrationsPanel}.
 */
export interface RegistrationsPanelProps {
  /** The project these registrations belong to. */
  projectId: string;
}

/** Says what `client_id` is, where the value is first shown. */
const CLIENT_ID_NOTE =
  "This is your client id. It identifies the application; it does not authenticate it, so it is safe to publish and it is not a credential.";

/**
 * The registrations under one project: what is there, how to add one, and how
 * to stop one.
 *
 * A registration is what a credential belongs to, which is what makes a
 * withdrawal hit one application rather than the developer as a whole. Adding
 * a second registration touches neither the project nor its plan, which is the
 * point of the model.
 *
 * @param props - See {@link RegistrationsPanelProps}.
 * @returns The registrations screen content.
 */
export function RegistrationsPanel({ projectId }: RegistrationsPanelProps) {
  const [state, dispatch] = useReducer(registrationsPanelReducer, REGISTRATIONS_PANEL_INITIAL_STATE);
  const { registrations, loadFailure, formOpen, fields, profile, phase, actionFailure } = state;

  useEffect(() => {
    const controller = new AbortController();
    getDeveloperProject(projectId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.data) {
        dispatch({
          type: RegistrationsPanelActionType.RegistrationsLoaded,
          registrations: result.data.registrations,
        });
        return;
      }
      dispatch({ type: RegistrationsPanelActionType.RegistrationsUnavailable, failure: toPanelFailure(result) });
    });
    return () => controller.abort();
  }, [projectId]);

  const onName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({ type: RegistrationsPanelActionType.FieldEdited, field: "name", value: event.target.value }),
    [],
  );
  const onWebsite = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({ type: RegistrationsPanelActionType.FieldEdited, field: "websiteUrl", value: event.target.value }),
    [],
  );
  const onProfile = useCallback(
    (chosen: Parameters<typeof RegistrationProfileChoice>[0]["value"]) =>
      dispatch({ type: RegistrationsPanelActionType.ProfileChosen, profile: chosen }),
    [],
  );
  const onOpen = useCallback(() => dispatch({ type: RegistrationsPanelActionType.FormToggled, open: true }), []);
  const onCancel = useCallback(() => dispatch({ type: RegistrationsPanelActionType.FormToggled, open: false }), []);

  const onCreate = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = fields.name.trim();
      if (!name || name.length > MAX_APP_NAME_LENGTH) {
        dispatch({
          type: RegistrationsPanelActionType.ValidationFailed,
          message: `A name is required, and it may be at most ${MAX_APP_NAME_LENGTH} characters.`,
        });
        return;
      }

      dispatch({ type: RegistrationsPanelActionType.ActionStarted });
      const website = fields.websiteUrl.trim();
      const result = await createClientRegistration(projectId, {
        name,
        registrationType: profile,
        websiteUrl: website === "" ? null : website,
      });
      if (result.ok && result.data) {
        dispatch({ type: RegistrationsPanelActionType.CreateSucceeded, registration: result.data.registration });
        return;
      }
      dispatch({ type: RegistrationsPanelActionType.ActionFailed, failure: toPanelFailure(result) });
    },
    [fields, profile, projectId],
  );

  const changeStatus = useCallback(async (registrationId: string, status: ApiClientStatusValue) => {
    dispatch({ type: RegistrationsPanelActionType.ActionStarted });
    const result = await updateClientRegistration(registrationId, { status });
    if (result.ok && result.data) {
      dispatch({ type: RegistrationsPanelActionType.RegistrationChanged, registration: result.data.registration });
      return;
    }
    dispatch({ type: RegistrationsPanelActionType.ActionFailed, failure: toPanelFailure(result) });
  }, []);

  if (loadFailure) return <ApiFailureNotice {...loadFailure} />;

  return (
    <section>
      <div className="card-content-inset flex items-center justify-between gap-3 mb-3">
        <h2 className="text-card-title font-medium tracking-tight">Registrations</h2>
        {!formOpen && (
          <button type="button" onClick={onOpen} className="button button--secondary text-body">
            <AddIcon className="size-5" aria-hidden="true" />
            New registration
          </button>
        )}
      </div>

      <div className="surface-card px-6 py-5 flex flex-col gap-5">
        <p className="text-body text-fg-muted">
          A registration is what a key belongs to. Revoking one stops that application and leaves the others alone, so
          give each application its own rather than sharing one key between them.
        </p>

        {formOpen && (
          <form onSubmit={onCreate} className="flex flex-col gap-4" noValidate>
            <TextField
              name="name"
              label="Application name"
              value={fields.name}
              onChange={onName}
              placeholder="My Music App"
            />
            <TextField
              name="websiteUrl"
              label="Application website"
              value={fields.websiteUrl}
              onChange={onWebsite}
              required={false}
              placeholder="https://example.com/app"
              hint="Optional. Where this application can be looked at, so we know what it is if we ever have to ask about it."
            />
            <RegistrationProfileChoice name="registrationType" value={profile} onSelect={onProfile} />
            {actionFailure && <ApiFailureNotice {...actionFailure} />}
            <div className="flex gap-3">
              <div className="sm:max-w-xs flex-1">
                <SubmitButton loading={phase === FormPhase.Submitting}>Create registration</SubmitButton>
              </div>
              <div className="sm:max-w-xs flex-1">
                <SubmitButton variant={ButtonVariant.Secondary} type="button" onClick={onCancel}>
                  Cancel
                </SubmitButton>
              </div>
            </div>
          </form>
        )}

        {!formOpen && actionFailure && <ApiFailureNotice {...actionFailure} />}

        {registrations === null && <p className="text-body text-fg-muted">Loading…</p>}

        {registrations !== null && registrations.length === 0 && !formOpen && (
          <p className="text-body text-fg-muted">No registrations yet. Create the first one above.</p>
        )}

        {registrations !== null && registrations.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {registrations.map((registration) => {
              const copy = registrationProfileCopy(registration.registrationType);
              const isActive = registration.status === ApiClientStatus.Active;
              const isRevoked = registration.status === ApiClientStatus.Revoked;
              return (
                <li key={registration.id} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-body font-medium text-fg truncate">{registration.appName}</span>
                    <StatusBadge status={registration.status} />
                  </div>
                  <p className="text-nav text-fg-subtle">
                    {copy?.label ?? registration.registrationType} · created {formatDate(registration.createdAt)}
                  </p>
                  <p className="text-nav text-fg-subtle">
                    <code className="text-code-fg">{registration.publicClientId}</code>
                  </p>
                  <p className="text-nav text-fg-subtle">{CLIENT_ID_NOTE}</p>
                  {registration.websiteUrl && (
                    <p className="text-nav text-fg-subtle">
                      <a
                        href={registration.websiteUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="content-link"
                      >
                        {registration.websiteUrl}
                      </a>
                    </p>
                  )}
                  <p className="text-nav text-fg-subtle mt-1">
                    {isRevoked
                      ? "Revoked. Its keys no longer authenticate and it cannot be brought back."
                      : isActive
                        ? "Suspending stops its keys from authenticating and can be undone. Revoking does the same and cannot."
                        : "Suspended: its keys do not authenticate until it is reactivated."}
                  </p>
                  <RegistrationTokens
                    registrationId={registration.id}
                    registrationName={registration.appName}
                    tokens={registration.tokens}
                    registrationActive={isActive}
                  />
                  {!isRevoked && (
                    <div className="flex flex-wrap gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          changeStatus(registration.id, isActive ? ApiClientStatus.Suspended : ApiClientStatus.Active)
                        }
                        className="button button--secondary text-body"
                      >
                        {isActive ? "Suspend" : "Reactivate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => changeStatus(registration.id, ApiClientStatus.Revoked)}
                        className="button button--danger text-body"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
