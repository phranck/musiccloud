import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useReducer } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { postAuth } from "@/lib/authClient";
import { AuthErrorCode, authErrorLabel } from "@/lib/authErrors";
import { AuthStatusTone } from "@/lib/authStatusTone";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/** Minimum password length the backend accepts (mirrors `PASSWORD_MIN_LENGTH`). */
const PASSWORD_MIN_LENGTH = 8;
/** Maximum password length the backend accepts (mirrors `PASSWORD_MAX_LENGTH`). */
const PASSWORD_MAX_LENGTH = 128;

/**
 * Consolidated signup-form state. Grouped behind a single `useReducer` (rather
 * than six `useState` slots) so a submit can update the phase and clear both
 * field errors in one dispatch — one render, no intermediate states.
 */
interface SignupState {
  /** Current display-name input (optional field). */
  displayName: string;
  /** Current email input. */
  email: string;
  /** Current password input. */
  password: string;
  /** The submission lifecycle phase. */
  phase: FormPhaseValue;
  /** Inline error attached to the email field, or `null`. */
  emailError: string | null;
  /** Inline error attached to the password field, or `null`. */
  passwordError: string | null;
}

/** The initial, pristine signup state. */
const INITIAL_STATE: SignupState = {
  displayName: "",
  email: "",
  password: "",
  phase: FormPhase.Idle,
  emailError: null,
  passwordError: null,
};

/**
 * Merge a partial patch into the signup state.
 *
 * A deliberately simple "setState-as-reducer" pattern: every update is a shallow
 * merge, so there is a single action shape (a state patch) and no discriminant
 * literals. It exists only to group the form's fields under one state atom.
 *
 * @param state - The current state.
 * @param patch - The fields to overwrite.
 * @returns The next state.
 */
function reduceSignup(state: SignupState, patch: Partial<SignupState>): SignupState {
  return { ...state, ...patch };
}

/**
 * Signup island for the developer portal: optional display name, email, and
 * password posted to the BFF `/api/dev/auth/signup`. A `201` does NOT log the
 * user in (no session); instead it swaps to an "info" status panel telling them
 * to verify by email. `409` (`EMAIL_TAKEN`) attaches an inline error to the
 * email field; a `400` surfaces the backend validation message on the password
 * field (e.g. the length rule).
 *
 * Rendered with `client:load` from `signup.astro`, below the GitHub button.
 *
 * @returns The signup form, or the post-submit "check your email" panel.
 */
export function SignupForm() {
  const [state, dispatch] = useReducer(reduceSignup, INITIAL_STATE);
  const { displayName, email, password, phase, emailError, passwordError } = state;

  const onDisplayName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => dispatch({ displayName: event.target.value }),
    [],
  );
  const onEmail = useCallback((event: ChangeEvent<HTMLInputElement>) => dispatch({ email: event.target.value }), []);
  const onPassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => dispatch({ password: event.target.value }),
    [],
  );

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      dispatch({ phase: FormPhase.Submitting, emailError: null, passwordError: null });

      const result = await postAuth(ENDPOINTS.dev.auth.signup, {
        email,
        password,
        displayName: displayName.trim() || undefined,
      });

      if (result.ok) {
        dispatch({ phase: FormPhase.Success });
        return;
      }

      const label = authErrorLabel(result.code, result.message);
      if (result.code === AuthErrorCode.EmailTaken) {
        dispatch({ phase: FormPhase.Error, emailError: label });
      } else {
        dispatch({ phase: FormPhase.Error, passwordError: label });
      }
    },
    [displayName, email, password],
  );

  if (phase === FormPhase.Success) {
    return (
      <AuthStatus tone={AuthStatusTone.Info} title="Check your email">
        We sent a verification link to <span className="text-fg">{email}</span>. Click it to activate your account, then
        sign in.
      </AuthStatus>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        name="displayName"
        label="Display name"
        value={displayName}
        onChange={onDisplayName}
        autoComplete="name"
        required={false}
        placeholder="Optional"
      />
      <TextField
        name="email"
        label="Email"
        type="email"
        value={email}
        onChange={onEmail}
        autoComplete="email"
        placeholder="you@example.com"
        error={emailError ?? undefined}
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        value={password}
        onChange={onPassword}
        autoComplete="new-password"
        hint={`${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`}
        error={passwordError ?? undefined}
      />
      <SubmitButton loading={phase === FormPhase.Submitting}>Create account</SubmitButton>
    </form>
  );
}
