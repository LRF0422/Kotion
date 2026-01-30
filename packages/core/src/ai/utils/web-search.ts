import { axios } from "@kn/common"
import { WEB_SEARCH_API_URL, WEB_SEARCH_MAX_RESULTS } from "../types"
import type { WebSearchResult } from "../types"

/**
 * Perform web search using Bocha API as primary provider, with fallbacks
 * 
 * The function tries multiple search providers in this order:
 * 1. Bocha API (primary) - Requires VITE_BOCHA_API_KEY environment variable
 * 2. Backend API (/api/web-search)
 * 3. DuckDuckGo API (fallback)
 * 
 * Bocha API provides high-quality, semantic search results suitable for AI applications.
 * It offers better results for Chinese content and has lower latency compared to global alternatives.
 */
export const performWebSearch = async (
    query: string,
    maxResults: number = 10
): Promise<WebSearchResult[]> => {
    try {
        // Try Bocha API as primary provider
        const bochaApiKey = "sk-7382a61a8da5451a90ab6dc041e8a3e5";

        if (bochaApiKey) {
            // Call Bocha API with correct endpoint and parameters
            const bochaResponse = await axios.post('https://api.bochaai.com/v1/web-search', {
                query: query,
                summary: true,
                count: maxResults,
            }, {
                headers: {
                    'Authorization': `Bearer ${bochaApiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
                validateStatus: (status) => status < 500
            });
            console.log('bochaResults', bochaResponse.data);
            if (bochaResponse.data.data.webPages?.value) {
                // Transform Bocha results to WebSearchResult format
                console.log('bochaResults', bochaResponse.data);
                const bochaResults: WebSearchResult[] = bochaResponse.data.data.webPages.value.slice(0, maxResults).map((item: any) => ({
                    title: item.name || 'No title',
                    url: item.url,
                    snippet: item.summary || item.snippet || item.description || '',
                    source: item.source || '博查AI'
                }));

                if (bochaResults.length > 0) {
                    return bochaResults;
                }
            }
        }

        // Fallback: Try backend API
        try {
            const response = await axios.post(WEB_SEARCH_API_URL, {
                query,
                maxResults
            }, {
                timeout: 10000,
                validateStatus: (status) => status < 500
            });

            if (response.status === 200 && response.data?.results) {
                return response.data.results;
            }
        } catch (backendError) {
            // Continue to next fallback
        }

        // Fallback: Use DuckDuckGo Instant Answer API
        const ddgResponse = await axios.get(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            { timeout: 8000 }
        )

        const results: WebSearchResult[] = []

        if (ddgResponse.data) {
            const data = ddgResponse.data

            // Abstract (main result)
            if (data.Abstract && data.AbstractURL) {
                results.push({
                    title: data.Heading || 'Main Result',
                    url: data.AbstractURL,
                    snippet: data.Abstract,
                    source: data.AbstractSource
                })
            }

            // Related topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
                    if (topic.FirstURL && topic.Text) {
                        results.push({
                            title: topic.Text?.split(' - ')[0] || 'Related',
                            url: topic.FirstURL,
                            snippet: topic.Text,
                            source: 'DuckDuckGo'
                        })
                    }
                }
            }

            // Answer (for direct answers)
            if (data.Answer && results.length === 0) {
                results.push({
                    title: 'Direct Answer',
                    url: data.AnswerURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: data.Answer,
                    source: 'DuckDuckGo'
                })
            }
        }

        return results.length > 0 ? results : [{
            title: 'Search Results',
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            snippet: `No direct results found. Please visit the search page for more results.`,
            source: 'DuckDuckGo'
        }]

    } catch (error) {
        console.error('Web search error:', error)
        return [{
            title: 'Search Error',
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: `Search failed. Click the link to search manually.`,
            source: 'Fallback'
        }]
    }
}

/**
 * Fetch webpage content
 */
export const fetchWebPage = async (
    url: string,
    extractText: boolean = true
): Promise<{ success: boolean; title?: string; content?: string; error?: string }> => {
    if (!url || !url.startsWith('http')) {
        return { success: false, error: 'Invalid URL' }
    }

    try {
        const response = await axios.post('/api/fetch-webpage', {
            url,
            extractText
        }, {
            timeout: 15000,
            validateStatus: (status) => status < 500
        })

        if (response.status === 200 && response.data) {
            return {
                success: true,
                title: response.data.title || 'Unknown',
                content: response.data.content?.slice(0, 5000) || ''
            }
        }

        return { success: false, error: 'Failed to fetch webpage' }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}
