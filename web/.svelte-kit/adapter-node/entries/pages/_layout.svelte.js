import { s as slot } from "../../chunks/index2.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _layout as default
};
