import { strict as assert } from 'node:assert'
import { normalizePersistedMermaidSource } from './mermaid-source-normalization.js'

async function assertUnchanged(source: string): Promise<void> {
    const result = await normalizePersistedMermaidSource(source)
    assert.equal(result.changed, false)
    assert.equal(result.source, source)
}

async function assertRecovered(source: string, expected: string): Promise<void> {
    const result = await normalizePersistedMermaidSource(source)
    assert.equal(result.changed, true)
    assert.equal(result.source, expected)

    const second = await normalizePersistedMermaidSource(result.source)
    assert.equal(second.changed, false, 'normalization must be idempotent')
    assert.equal(second.source, expected)
}

async function run(): Promise<void> {
    await assertUnchanged('sequenceDiagram\nAlice->>John: Hi\nJohn-->>Alice: Hello')
    await assertUnchanged('flowchart TD\nA --> B')
    await assertUnchanged('classDiagram\nAnimal <|-- Dog')

    await assertRecovered(
        'sequenceDiagram\nAlice-&gt;&gt;John: Hi',
        'sequenceDiagram\nAlice->>John: Hi',
    )
    await assertRecovered(
        'sequenceDiagram\nJohn--&gt;&gt;Alice: Hello',
        'sequenceDiagram\nJohn-->>Alice: Hello',
    )
    await assertRecovered('flowchart TD\nA --&gt; B', 'flowchart TD\nA --> B')
    await assertRecovered('classDiagram\nAnimal &lt;|-- Dog', 'classDiagram\nAnimal <|-- Dog')

    await assertUnchanged('flowchart TD\nA["literal &gt;"]')
    await assertUnchanged('flowchart TD\nA["literal --&gt; text"]')
    await assertUnchanged('flowchart TD\nA --&amp;gt; B')
    await assertUnchanged('flowchart TD\nA["unknown &copy; entity"]')
    await assertUnchanged('sequenceDiagram\nAlice-&gt;&gt;John: Hi\nthis is invalid')
}

run().then(
    () => console.log('mermaid source normalization checks passed'),
    (error) => {
        console.error(error)
        process.exitCode = 1
    },
)
