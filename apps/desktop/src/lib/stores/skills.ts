import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  scope: string;
}

export const skills = writable<SkillInfo[]>([]);

export async function loadSkills(cwd: string): Promise<void> {
  try {
    const resp = await invoke<{ ok: boolean; skills: SkillInfo[] }>('termlings_list_skills', { cwd });
    if (resp.ok) {
      skills.set(resp.skills);
    }
  } catch {
    // Failed to inspect workspace skills.
    skills.set([]);
  }
}
