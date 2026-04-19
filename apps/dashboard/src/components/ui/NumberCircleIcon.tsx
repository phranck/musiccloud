import {
  type Icon,
  type IconWeight,
  NumberCircleEightIcon,
  NumberCircleFiveIcon,
  NumberCircleFourIcon,
  NumberCircleNineIcon,
  NumberCircleOneIcon,
  NumberCircleSevenIcon,
  NumberCircleSixIcon,
  NumberCircleThreeIcon,
  NumberCircleTwoIcon,
} from "@phosphor-icons/react";

const ICONS: ReadonlyArray<Icon> = [
  NumberCircleOneIcon,
  NumberCircleTwoIcon,
  NumberCircleThreeIcon,
  NumberCircleFourIcon,
  NumberCircleFiveIcon,
  NumberCircleSixIcon,
  NumberCircleSevenIcon,
  NumberCircleEightIcon,
  NumberCircleNineIcon,
];

interface NumberCircleIconProps {
  /** 1-based index (1 → NumberCircleOne, 2 → NumberCircleTwo, …). */
  number: number;
  className?: string;
  weight?: IconWeight;
  "aria-label"?: string;
}

/**
 * Wraps the `NumberCircle{One..Nine}` Phosphor icons under a single number-in
 * interface. Falls back to a plain text badge when `number` is outside 1..9.
 */
export function NumberCircleIcon({
  number,
  className,
  weight = "duotone",
  "aria-label": ariaLabel,
}: NumberCircleIconProps) {
  const Icon = number >= 1 && number <= 9 ? ICONS[number - 1] : undefined;
  if (Icon) {
    return <Icon weight={weight} className={className} aria-label={ariaLabel ?? String(number)} />;
  }
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? String(number)}
      className={`inline-flex items-center justify-center text-[10px] font-mono ${className ?? ""}`}
    >
      {number}
    </span>
  );
}
