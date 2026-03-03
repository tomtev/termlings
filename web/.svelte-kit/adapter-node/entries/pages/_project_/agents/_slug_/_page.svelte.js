import { b as bind_props } from "../../../../../chunks/index2.js";
import { W as WorkspaceView } from "../../../../../chunks/WorkspaceView.js";
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
export {
  _page as default
};
