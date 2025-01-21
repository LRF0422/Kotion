import { Node } from "@repo/editor";


export const TestExt = Node.create({
    name: 'test',
    group: 'block',
    renderHTML() {
        return ['div']
    }
})