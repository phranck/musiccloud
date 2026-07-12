/**
 * @file Central icon module for the developer portal (MC-103).
 *
 * The portal renders **Iconsax** icons (free set, rounded corners) in the
 * Bulk style. This is a deliberate, user-ordered exception to the repo's
 * otherwise Phosphor-only icon rule, scoped to `apps/developer`. Every icon
 * used anywhere in the portal is bound and re-exported here so the style
 * decision (variant + colour inheritance) lives in exactly one place:
 *
 * - `variant="Bulk"`: the chosen Iconsax style.
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
  ArrowCircleDown,
  ArrowCircleUp,
  Book,
  Book1,
  Category,
  Cd,
  CloseCircle,
  Code,
  Coin,
  Copy,
  CopySuccess,
  Data,
  Diagram,
  DollarSquare,
  Flash,
  Forbidden,
  Global,
  Health,
  type Icon,
  type IconProps,
  Key,
  Like1,
  Link,
  Login,
  Logout,
  Menu,
  Profile,
  ProfileAdd,
  ProfileCircle,
  Refresh,
  Refresh2,
  Scroll,
  SearchNormal1,
  SearchStatus,
  Send2,
  ShieldTick,
  Sms,
  TickCircle,
  Warning2,
} from "iconsax-react";

/** The single Iconsax render style the portal uses (see the file header). */
const IconVariant = {
  Bulk: "Bulk",
} as const;

/**
 * Binds the portal's icon policy (Bulk + currentColor) onto an Iconsax
 * icon and returns a drop-in component that only needs `className`/`aria-*`.
 * Every bound icon also carries the `mc-icon` class, which global.css uses
 * to lift the Bulk secondary layer's hardcoded `opacity=".4"` to a level
 * that stays visible on the dark gradient.
 *
 * @param Base - The raw iconsax-react icon component.
 * @returns The pre-styled icon component.
 */
function bulk(Base: Icon): Icon {
  const Bound = ({ className, ...rest }: IconProps) => (
    <Base
      variant={IconVariant.Bulk}
      color="currentColor"
      className={className ? `mc-icon ${className}` : "mc-icon"}
      {...rest}
    />
  );
  Bound.displayName = `Bulk(${Base.displayName ?? Base.name ?? "Icon"})`;
  return Bound;
}

export const AddIcon = bulk(Add);
export const ArrowCircleDownIcon = bulk(ArrowCircleDown);
export const ArrowCircleUpIcon = bulk(ArrowCircleUp);
export const Book1Icon = bulk(Book1);
export const BookIcon = bulk(Book);
export const CategoryIcon = bulk(Category);
export const CdIcon = bulk(Cd);
export const CloseCircleIcon = bulk(CloseCircle);
export const CodeIcon = bulk(Code);
export const CoinIcon = bulk(Coin);
export const CopyIcon = bulk(Copy);
export const CopySuccessIcon = bulk(CopySuccess);
export const DataIcon = bulk(Data);
export const DiagramIcon = bulk(Diagram);
export const DollarSquareIcon = bulk(DollarSquare);
export const FlashIcon = bulk(Flash);
export const ForbiddenIcon = bulk(Forbidden);
export const GlobalIcon = bulk(Global);
export const HealthIcon = bulk(Health);
export const KeyIcon = bulk(Key);
export const Like1Icon = bulk(Like1);
export const LinkIcon = bulk(Link);
export const LoginIcon = bulk(Login);
export const LogoutIcon = bulk(Logout);
export const MenuIcon = bulk(Menu);
export const ProfileAddIcon = bulk(ProfileAdd);
export const ProfileCircleIcon = bulk(ProfileCircle);
export const ProfileIcon = bulk(Profile);
export const Refresh2Icon = bulk(Refresh2);
export const RefreshIcon = bulk(Refresh);
export const ScrollIcon = bulk(Scroll);
export const SearchNormal1Icon = bulk(SearchNormal1);
export const SearchStatusIcon = bulk(SearchStatus);
export const Send2Icon = bulk(Send2);
export const ShieldTickIcon = bulk(ShieldTick);
export const SmsIcon = bulk(Sms);
export const TickCircleIcon = bulk(TickCircle);
export const Warning2Icon = bulk(Warning2);
