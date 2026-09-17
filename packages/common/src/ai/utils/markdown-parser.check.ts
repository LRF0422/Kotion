import { parseMarkdownToNodes } from './markdown-parser'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, actual?: unknown): void {
    if (condition) {
        pass += 1
        console.log('  ok   ' + name)
    } else {
        fail += 1
        console.log('  FAIL ' + name + (actual === undefined ? '' : '  -> ' + JSON.stringify(actual)))
    }
}

const types = (nodes: any[]): string[] => nodes.map(node => node.type)
const itemTypes = (list: any): string[] => list.content.map((item: any) => item.type)
/** Inline content of a list item's paragraph. */
const paraContent = (list: any, index: number): any[] => list.content[index].content[0].content

console.log('\nCheckbox markers stay inside the list')

const mixed = parseMarkdownToNodes('- normal\n- [ ] todo\n- [x] done')
check('mixed bullets stay one bulletList', types(mixed).join(',') === 'bulletList', types(mixed))
check('items are listItem nodes', itemTypes(mixed[0]).join(',') === 'listItem,listItem,listItem', itemTypes(mixed[0]))
check('plain item has no checkbox', paraContent(mixed[0], 0)[0].type === 'text', paraContent(mixed[0], 0)[0])
check(
    'unchecked marker -> unchecked checkbox',
    paraContent(mixed[0], 1)[0].type === 'checkbox' && paraContent(mixed[0], 1)[0].attrs.checked === false,
    paraContent(mixed[0], 1)[0],
)
check(
    'checked marker -> checked checkbox',
    paraContent(mixed[0], 2)[0].type === 'checkbox' && paraContent(mixed[0], 2)[0].attrs.checked === true,
    paraContent(mixed[0], 2)[0],
)
check(
    'uppercase X is checked',
    parseMarkdownToNodes('- [X] done')[0].content[0].content[0].content[0].attrs.checked === true,
)
check(
    'marker without inner space ([]) works',
    parseMarkdownToNodes('- [] done')[0].content[0].content[0].content[0].type === 'checkbox',
)
check(
    'text after the marker is kept',
    paraContent(parseMarkdownToNodes('- [ ] todo')[0], 0)[1].text === 'todo',
)
check(
    'inline markdown after the marker is parsed',
    JSON.stringify(paraContent(parseMarkdownToNodes('- [ ] **bold**')[0], 0)[1]) ===
        JSON.stringify({ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }),
)

console.log('\nOrdered lists and separation')

check(
    'ordered item keeps a checkbox',
    types(parseMarkdownToNodes('1. [ ] todo')).join(',') === 'orderedList' &&
        parseMarkdownToNodes('1. [ ] todo')[0].content[0].content[0].content[0].type === 'checkbox',
)
check(
    'blank line splits lists',
    types(parseMarkdownToNodes('- [ ] a\n\n- b')).join(',') === 'bulletList,bulletList',
)
check(
    'bullet then ordered',
    types(parseMarkdownToNodes('- [ ] a\n1. b')).join(',') === 'bulletList,orderedList',
)
check('plain bullet list is unchanged', types(parseMarkdownToNodes('- a\n- b')).join(',') === 'bulletList')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
