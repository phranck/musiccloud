import { TickCircleIcon, Warning2Icon } from "@/lib/icons";
import { ResponseTone, type ResponseToneValue } from "./responseCard.types";

interface ResponseCardStatusProps {
  status: string;
  tone: ResponseToneValue;
}

/** Renders the indivisible response icon/code status unit. */
export function ResponseCardStatus({ status, tone }: ResponseCardStatusProps) {
  const StatusIcon = tone === ResponseTone.Success ? TickCircleIcon : Warning2Icon;

  return (
    <div className="response-card__status">
      <StatusIcon className="response-card__icon" aria-hidden="true" />
      <code className="response-card__code">{status}</code>
    </div>
  );
}
