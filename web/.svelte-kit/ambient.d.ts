
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const NVM_INC: string;
	export const HERD_PHP_81_INI_SCAN_DIR: string;
	export const rvm_use_flag: string;
	export const HERD_PHP_80_INI_SCAN_DIR: string;
	export const rvm_bin_path: string;
	export const TERM_PROGRAM: string;
	export const NODE: string;
	export const SSL_CERT_FILE: string;
	export const rvm_ruby_alias: string;
	export const rvm_quiet_flag: string;
	export const NVM_CD_FLAGS: string;
	export const rvm_gemstone_url: string;
	export const TERM: string;
	export const SHELL: string;
	export const CODEX_TUI_SESSION_LOG_PATH: string;
	export const rvm_docs_type: string;
	export const TMPDIR: string;
	export const HOMEBREW_REPOSITORY: string;
	export const CONDA_SHLVL: string;
	export const TG_SESSION_ID: string;
	export const TERM_PROGRAM_VERSION: string;
	export const CONDA_PROMPT_MODIFIER: string;
	export const CODEX_TUI_RECORD_SESSION: string;
	export const ZDOTDIR: string;
	export const rvm_hook: string;
	export const NO_COLOR: string;
	export const npm_config_local_prefix: string;
	export const SUPERSET_HOME_DIR: string;
	export const PNPM_HOME: string;
	export const LC_ALL: string;
	export const HERD_PHP_83_INI_SCAN_DIR: string;
	export const USER: string;
	export const SUPERSET_WORKSPACE_PATH: string;
	export const NVM_DIR: string;
	export const rvm_user_flag: string;
	export const rvm_gemstone_package_file: string;
	export const CONDA_EXE: string;
	export const rvm_path: string;
	export const SUPERSET_WORKSPACE_NAME: string;
	export const SSH_AUTH_SOCK: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const npm_execpath: string;
	export const rvm_proxy: string;
	export const HERD_PHP_82_INI_SCAN_DIR: string;
	export const rvm_ruby_global_gems_path: string;
	export const rvm_ruby_file: string;
	export const PAGER: string;
	export const rvm_sticky_flag: string;
	export const _CE_CONDA: string;
	export const rvm_silent_flag: string;
	export const rvm_prefix: string;
	export const rvm_ruby_make: string;
	export const PATH: string;
	export const HERD_PHP_84_INI_SCAN_DIR: string;
	export const npm_package_json: string;
	export const _: string;
	export const SUPERSET_PORT: string;
	export const CONDA_PREFIX: string;
	export const CODEX_THREAD_ID: string;
	export const npm_command: string;
	export const PWD: string;
	export const npm_lifecycle_event: string;
	export const SUPERSET_WORKSPACE_ID: string;
	export const npm_package_name: string;
	export const rvm_system_flag: string;
	export const rvm_sdk: string;
	export const SUPERSET_PANE_ID: string;
	export const LANG: string;
	export const SUPERSET_ENV: string;
	export const CODEX_MANAGED_BY_NPM: string;
	export const CODEX_CI: string;
	export const RBENV_SHELL: string;
	export const npm_package_version: string;
	export const _CE_M: string;
	export const rvm_version: string;
	export const SUPERSET_ORIG_ZDOTDIR: string;
	export const rvm_script_name: string;
	export const rvm_pretty_print_flag: string;
	export const SUPERSET_TAB_ID: string;
	export const SHLVL: string;
	export const HOME: string;
	export const rvm_ruby_mode: string;
	export const SUPERSET_HOOK_VERSION: string;
	export const rvm_ruby_string: string;
	export const HOMEBREW_PREFIX: string;
	export const rvm_ruby_configure: string;
	export const GH_PAGER: string;
	export const rvm_ruby_url: string;
	export const LOGNAME: string;
	export const CONDA_PYTHON_EXE: string;
	export const npm_lifecycle_script: string;
	export const rvm_alias_expanded: string;
	export const SUPERSET_ROOT_PATH: string;
	export const LC_CTYPE: string;
	export const NVM_BIN: string;
	export const CONDA_DEFAULT_ENV: string;
	export const BUN_INSTALL: string;
	export const npm_config_user_agent: string;
	export const rvm_nightly_flag: string;
	export const rvm_file_name: string;
	export const rvm_ruby_make_install: string;
	export const INFOPATH: string;
	export const HOMEBREW_CELLAR: string;
	export const HERD_PHP_74_INI_SCAN_DIR: string;
	export const rvm_niceness: string;
	export const rvm_delete_flag: string;
	export const rvm_ruby_bits: string;
	export const rvm_bin_flag: string;
	export const GIT_PAGER: string;
	export const rvm_only_path_flag: string;
	export const npm_node_execpath: string;
	export const COLORTERM: string;
	export const NODE_ENV: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		NVM_INC: string;
		HERD_PHP_81_INI_SCAN_DIR: string;
		rvm_use_flag: string;
		HERD_PHP_80_INI_SCAN_DIR: string;
		rvm_bin_path: string;
		TERM_PROGRAM: string;
		NODE: string;
		SSL_CERT_FILE: string;
		rvm_ruby_alias: string;
		rvm_quiet_flag: string;
		NVM_CD_FLAGS: string;
		rvm_gemstone_url: string;
		TERM: string;
		SHELL: string;
		CODEX_TUI_SESSION_LOG_PATH: string;
		rvm_docs_type: string;
		TMPDIR: string;
		HOMEBREW_REPOSITORY: string;
		CONDA_SHLVL: string;
		TG_SESSION_ID: string;
		TERM_PROGRAM_VERSION: string;
		CONDA_PROMPT_MODIFIER: string;
		CODEX_TUI_RECORD_SESSION: string;
		ZDOTDIR: string;
		rvm_hook: string;
		NO_COLOR: string;
		npm_config_local_prefix: string;
		SUPERSET_HOME_DIR: string;
		PNPM_HOME: string;
		LC_ALL: string;
		HERD_PHP_83_INI_SCAN_DIR: string;
		USER: string;
		SUPERSET_WORKSPACE_PATH: string;
		NVM_DIR: string;
		rvm_user_flag: string;
		rvm_gemstone_package_file: string;
		CONDA_EXE: string;
		rvm_path: string;
		SUPERSET_WORKSPACE_NAME: string;
		SSH_AUTH_SOCK: string;
		__CF_USER_TEXT_ENCODING: string;
		npm_execpath: string;
		rvm_proxy: string;
		HERD_PHP_82_INI_SCAN_DIR: string;
		rvm_ruby_global_gems_path: string;
		rvm_ruby_file: string;
		PAGER: string;
		rvm_sticky_flag: string;
		_CE_CONDA: string;
		rvm_silent_flag: string;
		rvm_prefix: string;
		rvm_ruby_make: string;
		PATH: string;
		HERD_PHP_84_INI_SCAN_DIR: string;
		npm_package_json: string;
		_: string;
		SUPERSET_PORT: string;
		CONDA_PREFIX: string;
		CODEX_THREAD_ID: string;
		npm_command: string;
		PWD: string;
		npm_lifecycle_event: string;
		SUPERSET_WORKSPACE_ID: string;
		npm_package_name: string;
		rvm_system_flag: string;
		rvm_sdk: string;
		SUPERSET_PANE_ID: string;
		LANG: string;
		SUPERSET_ENV: string;
		CODEX_MANAGED_BY_NPM: string;
		CODEX_CI: string;
		RBENV_SHELL: string;
		npm_package_version: string;
		_CE_M: string;
		rvm_version: string;
		SUPERSET_ORIG_ZDOTDIR: string;
		rvm_script_name: string;
		rvm_pretty_print_flag: string;
		SUPERSET_TAB_ID: string;
		SHLVL: string;
		HOME: string;
		rvm_ruby_mode: string;
		SUPERSET_HOOK_VERSION: string;
		rvm_ruby_string: string;
		HOMEBREW_PREFIX: string;
		rvm_ruby_configure: string;
		GH_PAGER: string;
		rvm_ruby_url: string;
		LOGNAME: string;
		CONDA_PYTHON_EXE: string;
		npm_lifecycle_script: string;
		rvm_alias_expanded: string;
		SUPERSET_ROOT_PATH: string;
		LC_CTYPE: string;
		NVM_BIN: string;
		CONDA_DEFAULT_ENV: string;
		BUN_INSTALL: string;
		npm_config_user_agent: string;
		rvm_nightly_flag: string;
		rvm_file_name: string;
		rvm_ruby_make_install: string;
		INFOPATH: string;
		HOMEBREW_CELLAR: string;
		HERD_PHP_74_INI_SCAN_DIR: string;
		rvm_niceness: string;
		rvm_delete_flag: string;
		rvm_ruby_bits: string;
		rvm_bin_flag: string;
		GIT_PAGER: string;
		rvm_only_path_flag: string;
		npm_node_execpath: string;
		COLORTERM: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
