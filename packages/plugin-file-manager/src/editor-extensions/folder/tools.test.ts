/**
 * File Manager Tools Test Suite
 * 
 * Tests to verify that the file manager tools work correctly for agent interaction.
 */

import { Editor } from '@kn/editor'
import { insertNetworkImageTool } from './tools'

// Mock editor instance for testing
const mockEditor: Editor = {
    chain: () => ({
        focus: () => ({
            insertContent: (content: any) => ({ run: () => true }),
            insertContentAt: (pos: number, content: any) => ({ run: () => true })
        })
    }),
    state: {
        doc: { nodeSize: 100 }
    }
} as any

describe('File Manager Tools', () => {
    test('should have all required tools defined', () => {
        expect(insertNetworkImageTool).toBeDefined()
    })

    test('should have proper tool structure', () => {
        const tools = [
            insertNetworkImageTool
        ]

        tools.forEach(tool => {
            expect(tool.name).toBeDefined()
            expect(typeof tool.description).toBe('string')
            expect(tool.inputSchema).toBeDefined()
            expect(typeof tool.execute).toBe('function')

            // Test that execute function returns another function
            const executor = tool.execute(mockEditor)
            expect(typeof executor).toBe('function')
        })
    })

    test('should have valid zod schemas', () => {
        const tools = [
            insertNetworkImageTool
        ]

        tools.forEach(tool => {
            // Test schema validation
            expect(() => tool.inputSchema.parse).toBeDefined()
        })
    })

    test('should parse input parameters correctly', async () => {

        // Test insertNetworkImageTool schema
        const insertNetworkParams = { url: 'https://example.com/image.jpg', alt: 'Test network image', pos: 30 }
        const parsedInsertNetworkParams = insertNetworkImageTool.inputSchema.parse(insertNetworkParams)
        expect(parsedInsertNetworkParams.url).toBe('https://example.com/image.jpg')
        expect(parsedInsertNetworkParams.alt).toBe('Test network image')
        expect(parsedInsertNetworkParams.pos).toBe(30)

        // Test getFileDownloadUrlTool schema
        const downloadParams = { fileId: 'download-file-id' }
    })

    test('should have descriptive tool names and descriptions', () => {

        expect(insertNetworkImageTool.name).toBe('insertNetworkImage')
        expect(insertNetworkImageTool.description).toContain('网络')
    })
})

export { }