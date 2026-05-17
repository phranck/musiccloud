import {
  FieldErrorText,
  FieldHelpText,
  FieldLabel,
  FieldLabelText,
  FieldOptional,
  fieldControlBaseClass,
  fieldErrorClass,
  fieldHelpClass,
  fieldLabelClass,
  fieldOptionalClass,
  inputSizeClass,
} from "@musiccloud/dashboard-ui";

export const formLabelClass = fieldLabelClass;
export const formOptionalClass = fieldOptionalClass;
export const formInputClass = `${fieldControlBaseClass} ${inputSizeClass.field}`;
export const formHelpClass = fieldHelpClass;
export const formErrorClass = fieldErrorClass;

export const FormLabel = FieldLabel;
export const FormLabelText = FieldLabelText;
export const FormOptional = FieldOptional;
export const FormHelpText = FieldHelpText;
export const FormErrorText = FieldErrorText;
