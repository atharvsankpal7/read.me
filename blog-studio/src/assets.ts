/* Template files, inlined into the preview. Edits to them hot-reload the preview. */
import pageCss from "../template/page.css?raw";
import kitCss from "../template/kit.css?raw";
import hljsCss from "../template/hljs.css?raw";
import pageJs from "../template/page.js?raw";
import figureCss from "../template/figure.css?raw";
import type { Assets } from "../shared/types";

export const assets: Assets = { pageCss, kitCss, hljsCss, pageJs, figureCss };
