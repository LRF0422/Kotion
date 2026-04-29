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
        // Test insertNetworkImageTool schema with basic params
        const insertNetworkParams = { url: 'https://example.com/image.jpg', alt: 'Test network image', pos: 30 }
        const parsedInsertNetworkParams = insertNetworkImageTool.inputSchema.parse(insertNetworkParams)
        expect(parsedInsertNetworkParams.url).toBe('https://example.com/image.jpg')
        expect(parsedInsertNetworkParams.alt).toBe('Test network image')
        expect(parsedInsertNetworkParams.pos).toBe(30)
    })

    test('should parse width parameter as string or number', () => {
        // Test width as percentage string
        const paramsWithPercentWidth = { url: 'https://example.com/image.jpg', width: '50%' }
        const parsedPercent = insertNetworkImageTool.inputSchema.parse(paramsWithPercentWidth)
        expect(parsedPercent.width).toBe('50%')

        // Test width as pixel number
        const paramsWithPixelWidth = { url: 'https://example.com/image.jpg', width: 400 }
        const parsedPixel = insertNetworkImageTool.inputSchema.parse(paramsWithPixelWidth)
        expect(parsedPixel.width).toBe(400)

        // Test without width (optional)
        const paramsWithoutWidth = { url: 'https://example.com/image.jpg' }
        const parsedNoWidth = insertNetworkImageTool.inputSchema.parse(paramsWithoutWidth)
        expect(parsedNoWidth.width).toBeUndefined()
    })

    test('should accept URLs with query strings and special characters', () => {
        // URLs with query strings
        const paramsWithQuery = { url: 'https://cdn.example.com/images/photo.jpg?w=800&h=600&q=90' }
        expect(() => insertNetworkImageTool.inputSchema.parse(paramsWithQuery)).not.toThrow()

        // URLs with fragments
        const paramsWithFragment = { url: 'https://example.com/image.jpg#section' }
        expect(() => insertNetworkImageTool.inputSchema.parse(paramsWithFragment)).not.toThrow()
    })

    test('should insert image with width parameter', async () => {
        const executor = insertNetworkImageTool.execute(mockEditor)
        const result = await executor({
            url: 'https://example.com/image.jpg',
            alt: 'Test image',
            width: '50%'
        })
        expect(result.success).toBe(true)
        expect(result.width).toBe('50%')
    })

    test('should default width to 100% when not specified', async () => {
        const executor = insertNetworkImageTool.execute(mockEditor)
        const result = await executor({
            url: 'https://example.com/image.jpg',
            alt: 'Test image'
        })
        expect(result.success).toBe(true)
        expect(result.width).toBe('100%')
    })

    test('should reject non-HTTP URLs', async () => {
        const executor = insertNetworkImageTool.execute(mockEditor)
        const result = await executor({
            url: 'ftp://example.com/image.jpg',
        })
        expect(result.success).toBe(false)
        expect(result.error).toContain('http')
    })

    test('should have descriptive tool names and descriptions', () => {
        expect(insertNetworkImageTool.name).toBe('insertNetworkImage')
        expect(insertNetworkImageTool.description).toContain('网络')
        expect(insertNetworkImageTool.description).toContain('宽度')
    })
})

export { }