import { Extension } from "@tiptap/core";


export interface TableOfContentStorage {
    toc: any[]
}


export const TableOfContent = Extension.create<any, TableOfContentStorage>({
    name: 'tableOfContent',
    addStorage() {
        return {
            toc: []
        }
    },

    onTransaction({ editor }) {
        const headings: any[] = [];
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
                const id = `heading-${headings.length + 1}`;
                headings.push({
                    level: node.attrs.level,
                    text: node.textContent,
                    id,
                });
            }
        });
        this.storage.toc = headings;
    }
})