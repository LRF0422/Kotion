import Document from "@tiptap/extension-document";


export const Doc = Document.extend({
    content: 'title{1} block*',
    addAttributes() {
        return {
            creator: {
                default: null
            },
            title: {
                default: null
            },
            cover: {
                default: null
            }
        }
    }
})