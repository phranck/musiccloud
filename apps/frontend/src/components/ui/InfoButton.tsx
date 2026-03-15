import { FaCircleInfo } from "react-icons/fa6";
import { useT } from "@/i18n/context";

interface InfoButtonProps {
  onClick: () => void;
}

export function InfoButton({ onClick }: InfoButtonProps) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("a11y.infoButton")}
      className="p-2 text-white/30 hover:text-white/70 transition-colors duration-150 rounded-lg focus:outline-none"
    >
      <FaCircleInfo className="w-5 h-5" />
    </button>
  );
}
