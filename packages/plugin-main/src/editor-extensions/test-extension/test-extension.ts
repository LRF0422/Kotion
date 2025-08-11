import { PMNode as Node } from "@kn/editor";


export const TestExt = Node.create({
    name: 'test',
    group: 'block',
    renderHTML() {
        return ['div']
    }
})