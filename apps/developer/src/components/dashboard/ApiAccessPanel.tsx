import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useReducer } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { TextAreaField } from "@/components/dashboard/TextAreaField";
import { ContentCard } from "@/components/docs/ContentCard";
import { ContentPanel } from "@/components/docs/ContentPanel";
import {
  AccessRequestStatus,
  listAccessRequests,
  MAX_APP_DESCRIPTION_LENGTH,
  MAX_APP_NAME_LENGTH,
  submitAccessRequest,
} from "@/lib/apiAccessClient";
import { ACCESS_PANEL_INITIAL_STATE, AccessPanelActionType, accessPanelReducer } from "@/lib/apiAccessPanelState";
import { formatDate } from "@/lib/formatDate";
import { FormPhase } from "@/lib/formPhase";
import { KeyIcon, ScrollIcon, Send2Icon } from "@/lib/icons";

/**
 * "API access" dashboard island: a request form (app name, description,
 * estimated daily requests) over the caller's own request history with
 * review status. All state lives in `accessPanelReducer`
 * (`lib/apiAccessPanelState.ts`); the list loads on mount and a successful
 * submit prepends the created request without a refetch (the POST response
 * carries it). Inline validation mirrors the backend caps so most errors
 * never round-trip.
 *
 * Rendered with `client:load` from `dashboard/api-access.astro`.
 *
 * @returns The API-access panel content.
 */
export function ApiAccessPanel() {
  const [state, dispatch] = useReducer(accessPanelReducer, ACCESS_PANEL_INITIAL_STATE);
  const { requests, listError, fields, phase, formError } = state;

  useEffect(() => {
    const controller = new AbortController();
    listAccessRequests(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.data) {
        dispatch({ type: AccessPanelActionType.RequestsLoaded, requests: result.data.requests });
      } else {
        dispatch({ type: AccessPanelActionType.RequestsUnavailable });
      }
    });
    return () => controller.abort();
  }, []);

  const onAppName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({ type: AccessPanelActionType.FieldEdited, field: "appName", value: event.target.value }),
    [],
  );
  const onAppDescription = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      dispatch({ type: AccessPanelActionType.FieldEdited, field: "appDescription", value: event.target.value }),
    [],
  );
  const onEstimatedPerDay = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({ type: AccessPanelActionType.FieldEdited, field: "estimatedPerDay", value: event.target.value }),
    [],
  );

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();

      const name = fields.appName.trim();
      const description = fields.appDescription.trim();
      const estimate = Number(fields.estimatedPerDay);
      if (!name || name.length > MAX_APP_NAME_LENGTH) {
        dispatch({
          type: AccessPanelActionType.ValidationFailed,
          message: `App name is required (max ${MAX_APP_NAME_LENGTH} characters).`,
        });
        return;
      }
      if (!description || description.length > MAX_APP_DESCRIPTION_LENGTH) {
        dispatch({
          type: AccessPanelActionType.ValidationFailed,
          message: `Description is required (max ${MAX_APP_DESCRIPTION_LENGTH} characters).`,
        });
        return;
      }
      if (!Number.isInteger(estimate) || estimate <= 0) {
        dispatch({
          type: AccessPanelActionType.ValidationFailed,
          message: "Estimated requests per day must be a positive whole number.",
        });
        return;
      }

      dispatch({ type: AccessPanelActionType.SubmitStarted });

      const result = await submitAccessRequest({
        appName: name,
        appDescription: description,
        estimatedRequestsPerDay: estimate,
      });

      if (result.ok && result.data) {
        dispatch({ type: AccessPanelActionType.SubmitSucceeded, request: result.data.request });
        return;
      }
      dispatch({
        type: AccessPanelActionType.SubmitFailed,
        message: result.message ?? "Something went wrong. Please try again.",
      });
    },
    [fields],
  );

  return (
    <div className="flex flex-col gap-6">
      <ContentCard>
        <ContentCard.Header>
          <ContentCard.Header.Icon>
            <KeyIcon aria-hidden="true" />
          </ContentCard.Header.Icon>
          <ContentCard.Header.Title>Request API access</ContentCard.Header.Title>
        </ContentCard.Header>
        <form onSubmit={onSubmit} noValidate>
          <ContentCard.Body>
            <ContentCard.Body.Copy>
              <p className="text-body text-fg-muted">
                Tell us about your app. Once a request is approved, the app and its keys appear under its{" "}
                <a href="/dashboard/projects" className="content-link text-fg">
                  project
                </a>
                .
              </p>
              <TextField
                name="appName"
                label="App name"
                value={fields.appName}
                onChange={onAppName}
                placeholder="My Music App"
              />
              <TextAreaField
                name="appDescription"
                label="What does your app do?"
                value={fields.appDescription}
                onChange={onAppDescription}
                placeholder="A short description of your app and how it uses the musiccloud API."
                maxLength={MAX_APP_DESCRIPTION_LENGTH}
              />
              <TextField
                name="estimatedRequestsPerDay"
                label="Estimated requests per day"
                type="number"
                value={fields.estimatedPerDay}
                onChange={onEstimatedPerDay}
                placeholder="500"
                hint="A rough estimate is fine. It helps us size your quota."
              />
              {formError ? <p className="field__message field__message--error">{formError}</p> : null}
              {phase === FormPhase.Success ? (
                <output className="text-body text-accent">
                  Request submitted. You will be notified once it has been reviewed.
                </output>
              ) : null}
            </ContentCard.Body.Copy>
          </ContentCard.Body>
          <ContentCard.Footer>
            <SubmitButton loading={phase === FormPhase.Submitting}>
              <Send2Icon className="size-5" aria-hidden="true" />
              Submit request
            </SubmitButton>
          </ContentCard.Footer>
        </form>
      </ContentCard>

      <ContentCard>
        <ContentCard.Header>
          <ContentCard.Header.Icon>
            <ScrollIcon aria-hidden="true" />
          </ContentCard.Header.Icon>
          <ContentCard.Header.Title>Your requests</ContentCard.Header.Title>
        </ContentCard.Header>
        <ContentCard.Body>
          <ContentCard.Body.Copy>
            {requests === null && !listError ? <p className="text-body text-fg-muted">Loading…</p> : null}
            {listError ? (
              <p className="field__message field__message--error">
                Could not load your requests. Reload the page to try again.
              </p>
            ) : null}
            {requests !== null && requests.length === 0 ? (
              <p className="text-body text-fg-muted">No requests yet. Submit your first one above.</p>
            ) : null}
          </ContentCard.Body.Copy>

          {requests !== null && requests.length > 0 ? (
            <ContentCard.Body.Stack>
              {requests.map((request) => (
                <ContentPanel key={request.id} className="content-panel--inset">
                  <ContentPanel.Header>
                    <ContentPanel.Header.Title className="truncate">{request.appName}</ContentPanel.Header.Title>
                    <ContentPanel.Meta>
                      <StatusBadge status={request.status} />
                    </ContentPanel.Meta>
                  </ContentPanel.Header>
                  <ContentPanel.Content>
                    <p className="text-nav text-fg-subtle">
                      Submitted {formatDate(request.submittedAt)}
                      {request.reviewedAt ? ` · reviewed ${formatDate(request.reviewedAt)}` : ""}
                    </p>
                    {request.status === AccessRequestStatus.Rejected && request.reviewNote ? (
                      <p className="text-body text-fg-muted mt-1.5">“{request.reviewNote}”</p>
                    ) : null}
                  </ContentPanel.Content>
                </ContentPanel>
              ))}
            </ContentCard.Body.Stack>
          ) : null}
        </ContentCard.Body>
      </ContentCard>
    </div>
  );
}
