import {
  FieldLabel,
  FieldLabelText,
  fieldControlBaseClass,
  inputSizeClass,
  textareaSizeClass,
} from "@musiccloud/dashboard-ui";

/** Shared class for single-line form inputs: base control styling + fixed field height. */
export const formInputClass = `${fieldControlBaseClass} ${inputSizeClass.field}`;

/** Shared class for multi-line form textareas: base control styling + a 3-row min-height and vertical resize. */
export const formTextareaClass = `${fieldControlBaseClass} ${textareaSizeClass.field} resize-y`;

export const FormLabel = FieldLabel;
export const FormLabelText = FieldLabelText;
