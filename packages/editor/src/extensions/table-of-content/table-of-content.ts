import { Extension } from "@tiptap/core";


export interface TableOfContentStorage {
    toc: any[]
}

const arrToTree = (tocs: any[]) => {
    const result: any[] = [];
    const levels = [result];

    tocs.forEach((o) => {
        let offset = -1;
        let parent = levels[o.level + offset];

        while (!parent) {
            offset -= 1;
            parent = levels[o.level + offset];
        }

        parent.push({ ...o, children: (levels[o.level] = []) });
    });

    return result;
};


export const TableOfContent = Extension.create<any, TableOfContentStorage>({
    name: 'tableOfContent',
    addStorage() {
        return {
            toc: []
        }
    },

    onCreate(this) {
        const headings: any[] = [];
        this.editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
                const id = `heading-${headings.length + 1}`;
                headings.push({
                    level: node.attrs.level,
                    text: node.textContent,
                    id,
                    pos
                })
            }
        })
        this.storage.toc = arrToTree(headings);
    },

    onUpdate(this) {
        const headings: any[] = [];
        this.editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
                const id = `heading-${headings.length + 1}`;
                headings.push({
                    level: node.attrs.level,
                    text: node.textContent,
                    id,
                    pos
                });
            }
        });
        this.storage.toc = arrToTree(headings);
    }
})