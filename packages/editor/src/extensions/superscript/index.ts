import { ExtensionWrapper } from "../../editor";
import { SuperscriptStaticMenu } from "./menu";
import {Superscript} from './superscript'
export * from "./superscript";
export * from "./menu";


export const SuperScriptExtension: ExtensionWrapper = {
	name: Superscript.name,
	extendsion: Superscript,
	flotMenuConfig: [SuperscriptStaticMenu]
}
