/**
 * @file Central icon module for the developer portal (MC-103).
 *
 * The portal renders **Iconsax** icons (free set, rounded corners) in the
 * TwoTone style. This is a deliberate, user-ordered exception to the repo's
 * otherwise Phosphor-only icon rule, scoped to `apps/developer`. Every icon
 * used anywhere in the portal is bound and re-exported here so the style
 * decision (variant + colour inheritance) lives in exactly one place:
 *
 * - `variant="TwoTone"`: the chosen Iconsax style.
 * - `color="currentColor"`: iconsax-react has NO colour default; without
 *   this the SVG paths carry `stroke: undefined` and render invisible.
 *   Binding `currentColor` lets the usual Tailwind `text-*` utilities drive
 *   the icon colour, exactly like the Phosphor icons did.
 *
 * Call sites size icons via `className` (`size-5` …) and pass `aria-*` as
 * usual; both spread onto the underlying `<svg>`.
 *
 * The GitHub brand mark is NOT part of Iconsax's free set, so the GitHub
 * button keeps its Phosphor `GithubLogoIcon` (documented exception).
 */
import {
  Add,
  Book,
  Book1,
  Category,
  Cd,
  CloseCircle,
  Code,
  Coin,
  CommandSquare,
  Copy,
  Diagram,
  Flash,
  Forbidden,
  Global,
  type Icon,
  type IconProps,
  Key,
  Like1,
  Link,
  Logout,
  Profile,
  ProfileAdd,
  ProfileCircle,
  Refresh,
  Refresh2,
  Scroll,
  Send2,
  ShieldTick,
  Sms,
  TickCircle,
  Warning2,
} from "iconsax-react";

/** The single Iconsax render style the portal uses (see the file header). */
const IconVariant = {
  TwoTone: "TwoTone",
} as const;

/**
 * Binds the portal's icon policy (TwoTone + currentColor) onto an Iconsax
 * icon and returns a drop-in component that only needs `className`/`aria-*`.
 * Every bound icon also carries the `mc-icon` class, which global.css uses
 * to lift the TwoTone secondary layer's hardcoded `opacity=".4"` to a level
 * that stays visible on the dark gradient.
 *
 * @param Base - The raw iconsax-react icon component.
 * @returns The pre-styled icon component.
 */
function twotone(Base: Icon): Icon {
  const Bound = ({ className, ...rest }: IconProps) => (
    <Base
      variant={IconVariant.TwoTone}
      color="currentColor"
      className={className ? `mc-icon ${className}` : "mc-icon"}
      {...rest}
    />
  );
  Bound.displayName = `TwoTone(${Base.displayName ?? Base.name ?? "Icon"})`;
  return Bound;
}

export const AddIcon = twotone(Add);
export const Book1Icon = twotone(Book1);
export const BookIcon = twotone(Book);
export const CategoryIcon = twotone(Category);
export const CdIcon = twotone(Cd);
export const CloseCircleIcon = twotone(CloseCircle);
export const CodeIcon = twotone(Code);
export const CoinIcon = twotone(Coin);
export const CommandSquareIcon = twotone(CommandSquare);
export const CopyIcon = twotone(Copy);
export const DiagramIcon = twotone(Diagram);
export const FlashIcon = twotone(Flash);
export const ForbiddenIcon = twotone(Forbidden);
export const GlobalIcon = twotone(Global);
export const KeyIcon = twotone(Key);
export const Like1Icon = twotone(Like1);
export const LinkIcon = twotone(Link);
export const LogoutIcon = twotone(Logout);
export const ProfileAddIcon = twotone(ProfileAdd);
export const ProfileCircleIcon = twotone(ProfileCircle);
export const ProfileIcon = twotone(Profile);
export const Refresh2Icon = twotone(Refresh2);
export const RefreshIcon = twotone(Refresh);
export const ScrollIcon = twotone(Scroll);
export const Send2Icon = twotone(Send2);
export const ShieldTickIcon = twotone(ShieldTick);
export const SmsIcon = twotone(Sms);
export const TickCircleIcon = twotone(TickCircle);
export const Warning2Icon = twotone(Warning2);
