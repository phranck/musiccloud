import type { MetaState } from "../slices/metaSlice";

type MetaFields = MetaState["pages"][string]["initial"];

const META_DEFAULTS: MetaFields = {
  title: "",
  slug: "",
  status: "draft",
  showTitle: true,
  titleAlignment: "left",
  pageType: "default",
  displayMode: "fullscreen",
  overlayWidth: "regular",
  contentCardStyle: "default",
};

export function makeMeta(partial: Partial<MetaFields> = {}): MetaFields {
  return { ...META_DEFAULTS, ...partial };
}
