
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/hub" | "/api/hub/health" | "/api/v1" | "/api/v1/messages" | "/api/v1/projects" | "/api/v1/sessions" | "/api/v1/sessions/leave" | "/api/v1/state" | "/api/workspace" | "/api/workspace/delta-stream" | "/api/workspace/join" | "/api/workspace/leave" | "/api/workspace/message" | "/api/workspace/stream" | "/[project]" | "/[project]/agents" | "/[project]/agents/[slug]" | "/[project]/calendar" | "/[project]/channel" | "/[project]/channel/[channel]" | "/[project]/tasks";
		RouteParams(): {
			"/[project]": { project: string };
			"/[project]/agents": { project: string };
			"/[project]/agents/[slug]": { project: string; slug: string };
			"/[project]/calendar": { project: string };
			"/[project]/channel": { project: string };
			"/[project]/channel/[channel]": { project: string; channel: string };
			"/[project]/tasks": { project: string }
		};
		LayoutParams(): {
			"/": { project?: string; slug?: string; channel?: string };
			"/api": Record<string, never>;
			"/api/hub": Record<string, never>;
			"/api/hub/health": Record<string, never>;
			"/api/v1": Record<string, never>;
			"/api/v1/messages": Record<string, never>;
			"/api/v1/projects": Record<string, never>;
			"/api/v1/sessions": Record<string, never>;
			"/api/v1/sessions/leave": Record<string, never>;
			"/api/v1/state": Record<string, never>;
			"/api/workspace": Record<string, never>;
			"/api/workspace/delta-stream": Record<string, never>;
			"/api/workspace/join": Record<string, never>;
			"/api/workspace/leave": Record<string, never>;
			"/api/workspace/message": Record<string, never>;
			"/api/workspace/stream": Record<string, never>;
			"/[project]": { project: string; slug?: string; channel?: string };
			"/[project]/agents": { project: string; slug?: string };
			"/[project]/agents/[slug]": { project: string; slug: string };
			"/[project]/calendar": { project: string };
			"/[project]/channel": { project: string; channel?: string };
			"/[project]/channel/[channel]": { project: string; channel: string };
			"/[project]/tasks": { project: string }
		};
		Pathname(): "/" | "/api/hub/health" | "/api/v1/messages" | "/api/v1/projects" | "/api/v1/sessions" | "/api/v1/sessions/leave" | "/api/v1/state" | "/api/workspace" | "/api/workspace/delta-stream" | "/api/workspace/join" | "/api/workspace/leave" | "/api/workspace/message" | "/api/workspace/stream" | `/${string}` & {} | `/${string}/agents/${string}` & {} | `/${string}/calendar` & {} | `/${string}/channel` & {} | `/${string}/channel/${string}` & {} | `/${string}/tasks` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}