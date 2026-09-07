import { KPlugin, PluginConfig } from "@kn/common";
import { DrawnixExtension } from "./extension";
import { drawnixLocales } from "./i18n";

interface DrawnixPluginConfig extends PluginConfig {}
class Drawnix extends KPlugin<DrawnixPluginConfig> {}

export const drawnix = new Drawnix({
  status: "",
  name: "Drawnix",
  editorExtension: [DrawnixExtension],
  locales: drawnixLocales,
});
