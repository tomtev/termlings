import { h as bind_props } from './index2-bfgfN14Z.js';
import { W as WorkspaceView } from './WorkspaceView-CK5XaukA.js';
import '@sveltejs/kit/internal';
import './root-hoEiQALZ.js';
import '@sveltejs/kit/internal/server';
import './state.svelte-CncAy1T9.js';

function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    $$renderer2.push(`<!---->`);
    {
      WorkspaceView($$renderer2, {
        initialPayload: data.payload,
        initialThreadId: data.activeThreadId
      });
    }
    $$renderer2.push(`<!---->`);
    bind_props($$props, { data });
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-WtsvVtaH.js.map
