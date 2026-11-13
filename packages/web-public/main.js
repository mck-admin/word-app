import { initApp } from "../core/src/index.js";
import { loadSettings, saveSettings } from "../core/src/settings/settings-local.js";

initApp({ loadSettings, saveSettings });
