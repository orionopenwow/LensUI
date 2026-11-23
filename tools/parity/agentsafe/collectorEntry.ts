// Exposes the page collector on window for the hostile-page check in shoot.mjs.
import { collectorScript } from "../../../src/agentsafe/collector";
(window as any).__lensCollect = () => (0, eval)(collectorScript(500));
