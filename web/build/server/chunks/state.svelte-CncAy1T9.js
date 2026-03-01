import { n as noop } from './index2-bfgfN14Z.js';
import './root-hoEiQALZ.js';
import '@sveltejs/kit/internal/server';

const is_legacy = noop.toString().includes("$$") || /function \w+\(\) \{\}/.test(noop.toString());
if (is_legacy) {
  ({
    url: new URL("https://example.com")
  });
}
//# sourceMappingURL=state.svelte-CncAy1T9.js.map
