import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type ReactNode, type SyntheticEvent, useCallback, useReducer } from "react";
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
 * field errors in one dispatch: one render, no intermediate states.
 */
interface SignupState {
  /** Current display-name input (optional field). */
  displayName: string;
  /** Current email input. */
  email: string;
  /** Current password input. */
  password: string;
  /** Current repeat-password input, checked client-side against {@link password}. */
  confirmPassword: string;
  /** The submission lifecycle phase. */
  phase: FormPhaseValue;
  /** Inline error attached to the email field, or `null`. */
  emailError: string | null;
  /** Inline error attached to the password field, or `null`. */
  passwordError: string | null;
  /** Inline error attached to the repeat-password field, or `null`. */
  confirmPasswordError: string | null;
}

/** The initial, pristine signup state. */
const INITIAL_STATE: SignupState = {
  displayName: "",
  email: "",
  password: "",
  confirmPassword: "",
  phase: FormPhase.Idle,
  emailError: null,
  passwordError: null,
  confirmPasswordError: null,
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
 * Props for {@link SignupForm}.
 */
interface SignupFormProps {
  /**
   * The alternate sign-up affordances shown above the email/password form
   * (the "Continue with GitHub" button and the "or" divider), passed in as
   * Astro slot children. They render while the form is active and are dropped once it
   * succeeds, so the post-submit "check your email" panel stands on its own
   * (an "or" with no second option would otherwise linger).
   */
  children?: ReactNode;
  /**
   * Tier pre-selected via the pricing page's Subscribe button (MC-101),
   * already validated server-side by `signup.astro` (existing + enabled).
   * Shown as a hint above the fields and submitted as `tierId` so the
   * account is created with that tier assigned. Absent for a plain signup.
   */
  tier?: { id: string; name: string; color: string };
}

/**
 * Signup island for the developer portal: optional display name, email,
 * password and a repeat-password field posted to the BFF
 * `/api/dev/auth/signup`. The repeat field is checked against `password`
 * client-side before submit (no round-trip on mismatch, mirroring
 * `ResetForm`). A `201` does NOT log the user in (no session); instead it
 * swaps to an "info" status panel telling them to verify by email. `409`
 * (`EMAIL_TAKEN`) attaches an inline error to the email field; a `400`
 * surfaces the backend validation message on the password field (e.g. the
 * length rule).
 *
 * Rendered with `client:load` from `signup.astro`, wrapping the GitHub button
 * and "or" divider as its {@link SignupFormProps.children} so the success state
 * can hide them alongside the form.
 *
 * @param props - See {@link SignupFormProps}.
 * @returns The GitHub/divider affordances plus the signup form, or, once
 *   submitted, the standalone "check your email" panel.
 */
export function SignupForm({ children, tier }: SignupFormProps) {
  const [state, dispatch] = useReducer(reduceSignup, INITIAL_STATE);
  const { displayName, email, password, confirmPassword, phase, emailError, passwordError, confirmPasswordError } =
    state;

  const onDisplayName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => dispatch({ displayName: event.target.value }),
    [],
  );
  const onEmail = useCallback((event: ChangeEvent<HTMLInputElement>) => dispatch({ email: event.target.value }), []);
  const onPassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => dispatch({ password: event.target.value }),
    [],
  );
  const onConfirmPassword = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => dispatch({ confirmPassword: event.target.value }),
    [],
  );

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (password !== confirmPassword) {
        dispatch({ phase: FormPhase.Error, confirmPasswordError: "Passwords do not match." });
        return;
      }

      dispatch({ phase: FormPhase.Submitting, emailError: null, passwordError: null, confirmPasswordError: null });

      const result = await postAuth(ENDPOINTS.dev.auth.signup, {
        email,
        password,
        displayName: displayName.trim() || undefined,
        tierId: tier?.id,
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
    [displayName, email, password, confirmPassword, tier],
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
    <>
      {children}
      {tier && (
        <p className="icon-text-first-line gap-2 rounded-button border border-border bg-surface px-3 py-2 text-body text-fg-muted">
          <span className="icon-text-first-line__icon">
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tier.color }} aria-hidden="true" />
          </span>
          Signing up for the <span className="text-fg font-medium">{tier.name}</span> tier.
        </p>
      )}
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
        <TextField
          name="confirmPassword"
          label="Repeat password"
          type="password"
          value={confirmPassword}
          onChange={onConfirmPassword}
          autoComplete="new-password"
          error={confirmPasswordError ?? undefined}
        />
        <SubmitButton loading={phase === FormPhase.Submitting}>Create account</SubmitButton>
      </form>
    </>
  );
}
