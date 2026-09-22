/**
 * A minimal DOM, just enough to mount jspreadsheet in a Node test.
 *
 * jspreadsheet is a plain DOM widget and our pagination contract is only
 * observable through the DOM it builds (`tbody` row count), so the test needs a
 * document. Pulling in jsdom for that would be a large dependency for one
 * assertion, so this shim implements the subset the library actually touches.
 *
 * It is deliberately **not** a browser: layout is fake (`getBoundingClientRect`
 * returns zeroes) and CSS is never applied. Element *creation* and *attachment*
 * are modelled faithfully, which is what the pagination contract is about.
 */

class ClassList {
    private set = new Set<string>()

    add(...names: string[]): void { names.filter(Boolean).forEach((n) => this.set.add(n)) }
    remove(...names: string[]): void { names.forEach((n) => this.set.delete(n)) }
    contains(name: string): boolean { return this.set.has(name) }
    toggle(name: string, force?: boolean): boolean {
        const on = force === undefined ? !this.set.has(name) : force
        if (on) this.set.add(name)
        else this.set.delete(name)
        return on
    }
    get length(): number { return this.set.size }
    get value(): string { return [...this.set].join(' ') }
    set value(v: string) { this.set = new Set(String(v).split(/\s+/).filter(Boolean)) }
}

class Style {
    private props = new Map<string, unknown>()

    setProperty(key: string, value: unknown): void { this.props.set(key, value) }
    removeProperty(key: string): string { this.props.delete(key); return '' }
    getPropertyValue(key: string): unknown { return this.props.get(key) ?? '' }
    get cssText(): string {
        return [...this.props].map(([k, v]) => `${k}: ${v}`).join('; ')
    }
    set cssText(value: string) {
        this.props.clear()
        String(value ?? '').split(';').forEach((part) => {
            const i = part.indexOf(':')
            if (i > 0) this.props.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
        })
    }
}

const styleFacade = (style: Style) => new Proxy(style, {
    get(target, prop) {
        if (prop in target) return (target as any)[prop]
        return target.getPropertyValue(String(prop))
    },
    set(target, prop, value) {
        if (prop === 'cssText') (target as any).cssText = value
        else target.setProperty(String(prop), value)
        return true
    },
})

/** Number of element nodes allocated since the module loaded. */
let nodeCount = 0
export const elementsCreated = (): number => nodeCount

export class ShimNode {
    tagName: string
    nodeName: string
    nodeType = 1
    childNodes: ShimNode[] = []
    parentNode: ShimNode | null = null
    attributes: Record<string, string> = {}
    classList = new ClassList()
    style = styleFacade(new Style())
    offsetWidth = 0
    offsetHeight = 0
    clientWidth = 0
    clientHeight = 0
    scrollTop = 0
    scrollLeft = 0
    value = ''
    tabIndex = 0
    ariaHidden: unknown = null
    private text = ''
    private html = ''

    constructor(tagName: string) {
        nodeCount += 1
        this.tagName = String(tagName ?? '').toUpperCase()
        this.nodeName = this.tagName
    }

    get children(): ShimNode[] { return this.childNodes.filter((n) => n.nodeType === 1) }
    get firstChild(): ShimNode | null { return this.childNodes[0] ?? null }
    get lastChild(): ShimNode | null { return this.childNodes[this.childNodes.length - 1] ?? null }
    get parentElement(): ShimNode | null { return this.parentNode }
    get nextSibling(): ShimNode | null {
        if (!this.parentNode) return null
        const sibs = this.parentNode.childNodes
        return sibs[sibs.indexOf(this) + 1] ?? null
    }
    get previousSibling(): ShimNode | null {
        if (!this.parentNode) return null
        const sibs = this.parentNode.childNodes
        return sibs[sibs.indexOf(this) - 1] ?? null
    }
    get textContent(): string {
        return this.text + this.childNodes.map((n) => n.textContent).join('')
    }
    set textContent(value: string) { this.text = String(value ?? ''); this.childNodes = [] }
    get innerHTML(): string {
        if (this.html) return this.html
        return this.childNodes.map((n) => n.textContent).join('')
    }
    set innerHTML(value: string) {
        this.html = String(value ?? '')
        this.childNodes = []
        // A couple of library paths assign markup and then query the children.
        const tagRe = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g
        let match: RegExpExecArray | null
        while ((match = tagRe.exec(this.html))) {
            const child = new ShimNode(match[1]!)
            child.text = match[3]!
            const attrRe = /([\w-]+)="([^"]*)"/g
            let attr: RegExpExecArray | null
            while ((attr = attrRe.exec(match[2] ?? ''))) child.attributes[attr[1]!] = attr[2]!
            if (child.attributes.class) child.classList.value = child.attributes.class
            this.appendChild(child)
        }
    }
    get className(): string { return this.classList.value }
    set className(v: string) { this.classList.value = v }
    get id(): string { return this.attributes.id ?? '' }
    set id(v: string) { this.attributes.id = v }

    appendChild<T extends ShimNode>(node: T): T {
        if (node.parentNode) node.parentNode.removeChild(node)
        node.parentNode = this
        this.childNodes.push(node)
        return node
    }
    insertBefore<T extends ShimNode>(node: T, ref: ShimNode | null): T {
        if (!ref) return this.appendChild(node)
        if (node.parentNode) node.parentNode.removeChild(node)
        const i = this.childNodes.indexOf(ref)
        node.parentNode = this
        if (i < 0) this.childNodes.push(node)
        else this.childNodes.splice(i, 0, node)
        return node
    }
    removeChild<T extends ShimNode>(node: T): T {
        const i = this.childNodes.indexOf(node)
        if (i >= 0) this.childNodes.splice(i, 1)
        node.parentNode = null
        return node
    }
    replaceChildren(...nodes: ShimNode[]): void {
        this.childNodes.forEach((n) => { n.parentNode = null })
        this.childNodes = []
        nodes.forEach((n) => this.appendChild(n))
    }
    remove(): void { this.parentNode?.removeChild(this) }

    setAttribute(key: string, value: unknown): void { this.attributes[key] = String(value) }
    getAttribute(key: string): string | null { return this.attributes[key] ?? null }
    removeAttribute(key: string): void { delete this.attributes[key] }
    hasAttribute(key: string): boolean { return key in this.attributes }

    getBoundingClientRect() {
        return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }
    }
    /** Only the selectors jspreadsheet uses: class, tag, and the `:scope >` prefix. */
    querySelectorAll(selector: string): ShimNode[] {
        const direct = selector.startsWith(':scope > ')
        const sel = direct ? selector.slice(':scope > '.length).trim() : selector
        const match = (el: ShimNode): boolean => {
            if (sel.startsWith('.')) return el.classList.contains(sel.slice(1))
            if (sel.startsWith('#')) return el.id === sel.slice(1)
            return el.tagName === sel.toUpperCase()
        }
        const out: ShimNode[] = []
        const walk = (el: ShimNode, depth: number) => {
            el.childNodes.forEach((child) => {
                if (match(child) && (!direct || depth === 0)) out.push(child)
                walk(child, depth + 1)
            })
        }
        walk(this, 0)
        return out
    }
    querySelector(selector: string): ShimNode | null { return this.querySelectorAll(selector)[0] ?? null }
    matches(selector: string): boolean {
        if (selector.startsWith('.')) return this.classList.contains(selector.slice(1))
        return this.tagName === selector.toUpperCase()
    }
    closest(selector: string): ShimNode | null {
        let el: ShimNode | null = this
        while (el) {
            if (el.matches(selector)) return el
            el = el.parentNode
        }
        return null
    }
    contains(node: ShimNode | null): boolean {
        let el = node
        while (el) {
            if (el === this) return true
            el = el.parentNode
        }
        return false
    }
    getElementsByTagName(tag: string): ShimNode[] {
        const want = tag.toUpperCase()
        const out: ShimNode[] = []
        const walk = (el: ShimNode) => el.childNodes.forEach((c) => {
            if (c.tagName === want) out.push(c)
            walk(c)
        })
        walk(this)
        return out
    }

    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean { return true }
    focus(): void {}
    select(): void {}
    click(): void {}
    getClientRects(): unknown[] { return [] }
    scrollIntoView(): void {}
    setSelectionRange(): void {}
    cloneNode(): ShimNode { return new ShimNode(this.tagName) }
    insertAdjacentHTML(_position: string, html: string): void { this.innerHTML = html }
}

/** Install the shim as the process globals. Call once, before importing jspreadsheet. */
export function installDom() {
    const document = new ShimNode('#document') as ShimNode & Record<string, any>
    document.nodeType = 9
    document.createElement = (tag: string) => new ShimNode(tag)
    document.createTextNode = (text: string) => {
        const n = new ShimNode('#text')
        n.nodeType = 3
        n.textContent = String(text)
        return n
    }
    document.createDocumentFragment = () => new ShimNode('#fragment')
    document.body = new ShimNode('body')
    document.head = new ShimNode('head')
    document.documentElement = new ShimNode('html')
    document.appendChild(document.body)
    document.appendChild(document.head)
    document.addEventListener = () => {}
    document.removeEventListener = () => {}
    document.dispatchEvent = () => true
    document.elementFromPoint = () => null
    document.activeElement = document.body

    const window: Record<string, any> = {
        document,
        navigator: { userAgent: 'node', language: 'zh-CN', clipboard: { readText: async () => '' } },
        location: { href: 'http://localhost/', origin: 'http://localhost' },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0),
        cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
        devicePixelRatio: 1,
        innerWidth: 1440,
        innerHeight: 900,
        matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
        MutationObserver: class { observe() {} disconnect() {} },
        ResizeObserver: class { observe() {} disconnect() {} },
        IntersectionObserver: class { observe() {} disconnect() {} },
        alert: () => {},
        confirm: () => true,
        prompt: () => '',
        getSelection: () => ({
            rangeCount: 0,
            getRangeAt: () => ({
                cloneRange() { return this },
                setEnd() {},
                selectNodeContents() {},
                toString: () => '',
            }),
            toString: () => '',
        }),
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
        Blob: class {},
        XMLHttpRequest: class { open() {} send() {} setRequestHeader() {} },
        Image: class {},
    }
    window.window = window
    window.self = window

    const g = globalThis as Record<string, any>
    /**
     * Node 21+ defines `navigator` (and `location`) as getter-only globals, so a
     * plain assignment throws. Redefining is fine for the ones that are
     * configurable, and the rest are skipped — the library only reads them.
     */
    const setGlobal = (key: string, value: unknown): void => {
        try {
            g[key] = value
        } catch {
            try {
                Object.defineProperty(g, key, { value, configurable: true, writable: true })
            } catch {
                // Read-only and not configurable: leave the host's own value.
            }
        }
    }

    const globals: Record<string, unknown> = {
        window,
        document,
        navigator: window.navigator,
        location: window.location,
        getComputedStyle: window.getComputedStyle,
        requestAnimationFrame: window.requestAnimationFrame,
        cancelAnimationFrame: window.cancelAnimationFrame,
        MutationObserver: window.MutationObserver,
        ResizeObserver: window.ResizeObserver,
        IntersectionObserver: window.IntersectionObserver,
        matchMedia: window.matchMedia,
        alert: window.alert,
        confirm: window.confirm,
        prompt: window.prompt,
        getSelection: window.getSelection,
        localStorage: window.localStorage,
        HTMLElement: ShimNode,
        Element: ShimNode,
        Node: ShimNode,
    }
    Object.entries(globals).forEach(([key, value]) => setGlobal(key, value))

    return { document, window }
}
