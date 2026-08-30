import { useCallback, useEffect, useState } from "react";
import { ProjectSwitcherControl, type SwitcherProject } from "@/components/dashboard/ProjectSwitcherControl";
import { listDeveloperProjects } from "@/lib/apiAccessClient";
import { readSelectedProjectId, resolveSelectedProjectId, writeSelectedProjectId } from "@/lib/selectedProject";

/**
 * Props for {@link ProjectSwitcher}.
 */
export interface ProjectSwitcherProps {
  /**
   * The project the surrounding page is showing, when the page knows it. On a
   * project's own screen the route decides; elsewhere the remembered selection
   * does.
   */
  currentProjectId?: string;
}

/** Where a project's own screen lives. */
function projectPath(projectId: string): string {
  return `/dashboard/projects/${projectId}`;
}

/**
 * Says which project the screen is about, and moves to another one.
 *
 * Every project-scoped screen carries this, because a screen that shows a
 * quota, a plan or a set of registrations without naming the project it means
 * becomes ambiguous the moment an account holds two.
 *
 * The selection survives a reload through `localStorage`, and a remembered
 * project that no longer exists falls back to the first one rather than
 * leaving the switcher pointing at nothing.
 *
 * @param props - See {@link ProjectSwitcherProps}.
 * @returns The switcher, or nothing whilst the account has no projects.
 */
export function ProjectSwitcher({ currentProjectId }: ProjectSwitcherProps) {
  const [projects, setProjects] = useState<SwitcherProject[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listDeveloperProjects(controller.signal).then((result) => {
      if (controller.signal.aborted || !result.ok || !result.data) return;
      const entries = result.data.projects.map((project) => ({
        id: project.id,
        displayName: project.displayName,
      }));
      const resolved =
        currentProjectId ??
        resolveSelectedProjectId(
          entries.map((entry) => entry.id),
          readSelectedProjectId(),
        );
      setProjects(entries);
      setSelectedId(resolved);
      writeSelectedProjectId(resolved);
    });
    return () => controller.abort();
  }, [currentProjectId]);

  const onSelect = useCallback((projectId: string) => {
    writeSelectedProjectId(projectId);
    window.location.href = projectPath(projectId);
  }, []);

  if (projects === null || projects.length === 0) return null;

  return <ProjectSwitcherControl projects={projects} selectedId={selectedId} onSelect={onSelect} />;
}
