import type { ChangeEvent } from "react";
import { useId } from "react";

/** One entry in the switcher: everything it needs and nothing else. */
export interface SwitcherProject {
  /** The project's id, which is the option's value. */
  id: string;
  /** The name the developer gave it. */
  displayName: string;
}

/**
 * Props for {@link ProjectSwitcherControl}.
 */
export interface ProjectSwitcherControlProps {
  /** The projects to choose between, in the order the list returned them. */
  projects: readonly SwitcherProject[];
  /** The project currently shown, or `null` before one is resolved. */
  selectedId: string | null;
  /** Called with the id of the project the developer picked. */
  onSelect: (projectId: string) => void;
}

/**
 * The switcher itself: a labelled native select.
 *
 * It is a native control rather than a custom menu because a select is
 * operable by keyboard and announced by a screen reader without any of that
 * being reimplemented, and there is nothing here that a select cannot do.
 *
 * Presentational on purpose: the surrounding island owns the loading and the
 * persistence, so this component can be rendered and asserted on its own.
 *
 * @param props - See {@link ProjectSwitcherControlProps}.
 * @returns The labelled select.
 */
export function ProjectSwitcherControl({ projects, selectedId, onSelect }: ProjectSwitcherControlProps) {
  const selectId = useId();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onSelect(event.target.value);
  }

  return (
    <div className="card-content-inset flex items-center gap-2 mb-4" data-project-switcher>
      <label htmlFor={selectId} className="text-nav text-fg-subtle">
        Project
      </label>
      <select
        id={selectId}
        value={selectedId ?? ""}
        onChange={handleChange}
        className="field__control max-w-xs text-body"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
