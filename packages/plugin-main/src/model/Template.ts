
export interface Template {
    id: string
    title: string
    description: string
    cover: string[]
    author: string
    authorAvatar?: string
    category: string
    categories?: Array<{ id: string; text: string }>
    downloads?: number
    rating?: number
    createdAt?: string
    sourceType?: 'page' | 'space'
    sourceId?: string
}
