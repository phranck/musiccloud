export type InputType = "text" | "password" | "email" | "url" | "tel" | "date" | "number";

export type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "select"
  | "multi-select"
  | "checkbox"
  | "richtext"
  | "button"
  | "password"
  | "headline"
  | "separator"
  | "paragraph";

export type RichTextVariant = "default" | "info" | "warning" | "hint";

export type FieldOptionsSource = "categories" | "regions";

export type ButtonActionType = "open-url" | "copy-clipboard" | "clear-field";

export interface ButtonAction {
  type: ButtonActionType;
  sourceFieldId: string;
}

export interface FormFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
}

export interface FormField {
  id: string;
  name?: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  optionsSource?: FieldOptionsSource;
  span?: number;
  validation?: FormFieldValidation;
  rows?: number;
  buttonType?: "button" | "submit" | "reset";
  buttonWidth?: "automatic" | "full";
  buttonAlign?: "left" | "center" | "right";
  buttonIcon?: string;
  buttonDisplay?: "text" | "icon" | "both";
  headlineLevel?: "h1" | "h2" | "h3";
  content?: string;
  variant?: RichTextVariant;
  subtext?: string;
  buttonAction?: ButtonAction;
  inputType?: InputType;
  allowMarkdown?: boolean;
}

export interface FormRow {
  id: string;
  fields: FormField[];
}

export interface SubmissionStepStore {
  type: "store";
}

export interface SubmissionStepEmail {
  type: "email";
  to: string;
  toFieldId?: string;
  subject?: string;
  replyToFieldId?: string;
  templateId?: number;
}

export interface SubmissionStepCreateShopSuggestion {
  type: "create-shop-suggestion";
}

export type SubmissionStep = SubmissionStepStore | SubmissionStepEmail | SubmissionStepCreateShopSuggestion;

export interface SubmissionConfig {
  steps: SubmissionStep[];
  successHeadline?: string;
  successMessage?: string;
  successRedirectUrl?: string;
}

export interface FormConfig {
  id: number;
  name: string;
  slug: string | null;
  rows: FormRow[];
  isActive: boolean;
  submissionConfig?: SubmissionConfig;
}

export interface FormConfigPayload {
  slug?: string;
  rows: FormRow[];
  submissionConfig?: SubmissionConfig;
}
