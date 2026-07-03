/**
 * @file Form-builder contract re-export. The canonical types live in
 * `@musiccloud/shared` (`packages/shared/src/form-builder.ts`, MC-082) because
 * the backend consumes them too (jsonb typing, validation, submission
 * pipeline); this module only preserves the dashboard's established
 * `@/shared/contracts` import path.
 */

export type {
  ButtonAction,
  ButtonActionType,
  FieldType,
  FormConfig,
  FormConfigPayload,
  FormField,
  FormFieldValidation,
  FormRow,
  InputType,
  RichTextVariant,
  SubmissionConfig,
  SubmissionStep,
  SubmissionStepEmail,
  SubmissionStepStore,
} from "@musiccloud/shared";
