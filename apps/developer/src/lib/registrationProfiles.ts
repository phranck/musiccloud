/**
 * @file What the three client profiles mean, in the words a developer needs
 * whilst choosing one.
 *
 * A developer choosing between them is choosing where their credential will
 * live, and the difference matters most to the person least likely to know it.
 * So each profile says what it is for, where its secret lives, and what it must
 * never do, rather than being a word in a list.
 *
 * The copy lives here rather than in the component so the choice and the
 * explanation cannot drift apart, and so the wording can be asserted.
 */
import { ClientRegistrationType, type ClientRegistrationTypeValue } from "@/lib/apiAccessClient";

/** How one profile is described at the point of choosing it. */
export interface RegistrationProfileCopy {
  /** The profile this describes. */
  type: ClientRegistrationTypeValue;
  /** The name a developer sees. */
  label: string;
  /** What the profile is for. */
  purpose: string;
  /** Where the credential for it lives. */
  credentialHome: string;
  /** What an application in this profile must never do. */
  neverDo: string;
}

/** The three profiles, in the order a developer meets them. */
export const REGISTRATION_PROFILES: readonly RegistrationProfileCopy[] = [
  {
    type: ClientRegistrationType.Development,
    label: "Development",
    purpose: "For building and trying things out on your own machine, and for scripts only you run.",
    credentialHome: "Its key lives on your machine, in a file you do not commit or in your shell's environment.",
    neverDo: "Do not use it for anything other people use. It is not meant to survive being shared.",
  },
  {
    type: ClientRegistrationType.Confidential,
    label: "Confidential",
    purpose: "For a server you control: a backend, a worker, a scheduled job.",
    credentialHome:
      "Its secret lives on that server, in its environment or its secret store, and never in a repository.",
    neverDo:
      "Never ship this secret inside anything a user can download. Anything installed on someone else's device can be read, so a distributed application must not carry it.",
  },
  {
    type: ClientRegistrationType.Public,
    label: "Public",
    purpose:
      "For an application installed on other people's devices: a mobile app, a desktop app, a browser extension.",
    credentialHome:
      "It holds no shared secret at all. Each installation enrols itself and gets its own key, and that key is bound to a keypair the installation generates and keeps, so a copied key is of no use anywhere else. That binding is DPoP.",
    neverDo:
      "Never embed a confidential secret or a long-lived key in a distributed application. Choose this profile instead, so a compromised installation costs one installation.",
  },
];

/**
 * The copy for one profile.
 *
 * @param type - The profile to describe.
 * @returns Its copy, or `undefined` for a profile that is not one of the three.
 */
export function registrationProfileCopy(type: string): RegistrationProfileCopy | undefined {
  return REGISTRATION_PROFILES.find((profile) => profile.type === type);
}
