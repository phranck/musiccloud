import type { ContentPage, PageType } from "@musiccloud/shared";
import { PlusCircleIcon } from "@phosphor-icons/react";
import { useReducer } from "react";

import { Dialog, dialogBtnPrimary, dialogBtnSecondary, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { useI18n } from "@/context/I18nContext";
import { useCreateContentPage } from "@/features/content/hooks/useAdminContent";
import { FormLabel, FormLabelText } from "@/shared/ui/FormPrimitives";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (page: ContentPage) => void;
  /** When true, the pageType control is locked to "default" (segment-target use-case). */
  lockDefaultType?: boolean;
}

interface State {
  title: string;
  slug: string;
  slugManual: boolean;
  pageType: PageType;
  error: string | null;
}

const INITIAL: State = { title: "", slug: "", slugManual: false, pageType: "default", error: null };

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreatePageDialog({ open, onClose, onCreated, lockDefaultType }: Props) {
  const { messages } = useI18n();
  const text = messages.content.pages;
  const common = messages.common;
  const createPage = useCreateContentPage();

  const [state, dispatch] = useReducer(
    (prev: State, action: Partial<State>): State => ({ ...prev, ...action }),
    INITIAL,
  );
  const { title, slug, slugManual, pageType, error } = state;

  function reset() {
    dispatch({ ...INITIAL });
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleTitleChange(val: string) {
    dispatch(slugManual ? { title: val } : { title: val, slug: slugify(val) });
  }

  function handleSlugChange(val: string) {
    dispatch({ slug: val, slugManual: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ error: null });
    try {
      const page = await createPage.mutateAsync({
        slug,
        title,
        pageType: lockDefaultType ? "default" : pageType,
      });
      reset();
      onClose();
      onCreated?.(page);
    } catch (err) {
      dispatch({ error: err instanceof Error ? err.message : (text.createError ?? "") });
    }
  }

  return (
    <Dialog
      open={open}
      title={text.createTitle}
      titleIcon={<PlusCircleIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={handleClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-3">
          <div>
            <FormLabel htmlFor="create-page-dialog-title">{text.fieldTitle}</FormLabel>
            <input
              id="create-page-dialog-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
              autoFocus
              placeholder={text.titlePlaceholder}
              className="w-full px-3 py-1.5 text-sm bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
            />
          </div>
          <div>
            <FormLabel htmlFor="create-page-dialog-slug">{text.fieldSlug}</FormLabel>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ds-text-muted)] shrink-0">/</span>
              <input
                id="create-page-dialog-slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                placeholder={text.slugPlaceholder}
                className="flex-1 px-3 py-1.5 text-sm bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent font-mono"
              />
            </div>
          </div>
          {!lockDefaultType && (
            <div>
              <FormLabelText>{text.fieldPageType}</FormLabelText>
              <Dropdown<PageType>
                value={pageType}
                onChange={(v) => dispatch({ pageType: v })}
                options={
                  [
                    { value: "default", label: text.pageTypeDefault },
                    { value: "segmented", label: text.pageTypeSegmented },
                  ] satisfies DropdownOption<PageType>[]
                }
              />
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <Dialog.Footer>
          <button type="button" onClick={handleClose} disabled={createPage.isPending} className={dialogBtnSecondary}>
            {common.cancel}
          </button>
          <button type="submit" disabled={createPage.isPending || !slug || !title} className={dialogBtnPrimary}>
            {createPage.isPending ? text.creating : text.create}
          </button>
        </Dialog.Footer>
      </form>
    </Dialog>
  );
}
