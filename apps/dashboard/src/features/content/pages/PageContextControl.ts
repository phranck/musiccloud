import { PageContextControlRoot } from "@/features/content/pages/PageContextControlRoot";
import { PageContextOption } from "@/features/content/pages/PageContextOption";
import { PageContextValidationMessage } from "@/features/content/pages/PageContextValidationMessage";

export type { PageContextControlProps } from "@/features/content/pages/PageContextControlRoot";

export const PageContextControl = Object.assign(PageContextControlRoot, {
  Root: PageContextControlRoot,
  Option: PageContextOption,
  ValidationMessage: PageContextValidationMessage,
});
