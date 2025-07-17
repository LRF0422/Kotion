import { ExtensionWrapper } from "@kn/common";
import { Markdown } from 'tiptap-markdown';


export const MarkDownExtension: ExtensionWrapper = {
    name: Markdown.name,
    extendsion: Markdown.configure({
        html: true,                  // Allow HTML input/output
        tightLists: true,            // No <p> inside <li> in markdown output
        tightListClass: 'tight',     // Add class to <ul> allowing you to remove <p> margins when tight
        bulletListMarker: '-',       // <li> prefix in markdown output
        linkify: false,              // Create links from "https://..." text
        breaks: false,               // New lines (\n) in markdown input are converted to <br>
        transformPastedText: true,  // Allow to paste markdown text in the editor
        transformCopiedText: false,
    })
}