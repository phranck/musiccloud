/**
 * @file The form-local shape of a plan's feature bullets.
 *
 * The list is edited by a component and read by the page that saves it, so
 * the shape and its two conversions live apart from either.
 */

/** One feature label with an id that survives reordering, so React can key it. */
export interface FormFeatureBullet {
  id: string;
  label: string;
}

/** Returns a collision-resistant id suitable for keying a form-local feature row. */
export function nextFeatureId(): string {
  return `feat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Converts server-side feature label strings to form-local bullets with stable ids. */
export function toFormFeatures(labels: string[]): FormFeatureBullet[] {
  return labels.map((label) => ({ id: nextFeatureId(), label }));
}

/** Turns the form-local rows back into the label list the server stores. */
export function toFeatureLabels(features: FormFeatureBullet[]): string[] {
  const labels: string[] = [];
  for (const feature of features) {
    const label = feature.label.trim();
    if (label.length > 0) labels.push(label);
  }
  return labels;
}

/** The most feature bullets a plan's pricing card carries. */
export const MAX_FEATURES = 12;
