import type { ClientRegistrationTypeValue } from "@/lib/apiAccessClient";
import { REGISTRATION_PROFILES } from "@/lib/registrationProfiles";

/**
 * Props for {@link RegistrationProfileChoice}.
 */
export interface RegistrationProfileChoiceProps {
  /** The profile currently chosen. */
  value: ClientRegistrationTypeValue;
  /** Called with the profile the developer picked. */
  onSelect: (type: ClientRegistrationTypeValue) => void;
  /** Name shared by the radio group, so the browser treats it as one choice. */
  name: string;
}

/**
 * The choice between the three client profiles, with each one explained where
 * it is chosen rather than behind a link.
 *
 * It is a radio group rather than a select, because each option carries three
 * sentences a developer needs whilst deciding, and a select shows one line.
 * The native inputs keep it operable by keyboard and announced as one group.
 *
 * @param props - See {@link RegistrationProfileChoiceProps}.
 * @returns The labelled radio group.
 */
export function RegistrationProfileChoice({ value, onSelect, name }: RegistrationProfileChoiceProps) {
  return (
    <fieldset className="flex flex-col gap-3" data-registration-profiles>
      <legend className="text-nav text-fg-subtle mb-1">Where will this application run?</legend>
      {REGISTRATION_PROFILES.map((profile) => (
        <label key={profile.type} className="flex gap-3 items-start cursor-pointer">
          <input
            type="radio"
            name={name}
            value={profile.type}
            checked={value === profile.type}
            onChange={() => onSelect(profile.type)}
            className="mt-1"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-body font-medium text-fg">{profile.label}</span>
            <span className="text-nav text-fg-muted">{profile.purpose}</span>
            <span className="text-nav text-fg-subtle">{profile.credentialHome}</span>
            <span className="text-nav text-fg-subtle">{profile.neverDo}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
