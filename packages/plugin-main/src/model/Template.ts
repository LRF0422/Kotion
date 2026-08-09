
export interface Template {
    id: string
    title: string
    description: string
    cover: string[]
    author: string
    /** Raw user id behind `author` — the wiki API only returns ids, names are resolved separately. */
    authorId?: string
    authorAvatar?: string
    category: string
    categories?: Array<{ id: string; text: string }>
    tags?: string[]
    downloads?: number
    rating?: number
    createdAt?: string
    updatedAt?: string
    sourceType?: 'page' | 'space'
    sourceId?: string
}
