import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common";
import { DrawnixExtension } from "./extension";
import { drawnixLocales } from "./i18n";
import { drawnixTools } from "./extension/tools/drawnix-tools";
import { drawnixSkill } from "./extension/skills/drawnix-skill";

interface DrawnixPluginConfig extends PluginConfig {}
class Drawnix extends KPlugin<DrawnixPluginConfig> {}

export const drawnix = new Drawnix({
  status: "",
  name: "Drawnix",
  editorExtension: [DrawnixExtension],
  agent: {
    tools: liftLegacyTools(drawnixTools, { scope: 'page' }),
    skills: liftLegacySkills([drawnixSkill]),
  },
  locales: drawnixLocales,
});
