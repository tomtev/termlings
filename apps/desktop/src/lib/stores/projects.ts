import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

export interface Project {
  id: string;
  name: string;
  path: string;
}

export const projects = writable<Project[]>([]);
export const activeProjectId = writable<string | null>(null);

export const activeProject = derived(
  [projects, activeProjectId],
  ([$projects, $activeProjectId]) =>
    $projects.find((p) => p.id === $activeProjectId) ?? null
);

export async function loadProjects() {
  const list = await invoke<Project[]>('list_projects');
  projects.set(list);
  const activeId = await invoke<string | null>('get_active_project_id');
  activeProjectId.set(activeId);
}

export async function addProject(path: string): Promise<Project> {
  const project = await invoke<Project>('add_project', { path });
  await loadProjects();
  return project;
}

export async function removeProject(projectId: string) {
  await invoke('remove_project', { projectId });
  await loadProjects();
}

export async function setActiveProject(projectId: string) {
  await invoke('set_active_project', { projectId });
  activeProjectId.set(projectId);
}
