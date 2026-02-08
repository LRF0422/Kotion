import { axios } from "@kn/common"
import { WEB_SEARCH_API_URL, WEB_SEARCH_MAX_RESULTS } from "../types"
import type { WebSearchResult } from "../types"

/**
 * Perform web search using multiple providers with fallbacks
 *
 * The function tries multiple search providers in this order:
 * 1. Tavily API (primary) - Requires VITE_TAVILY_API_KEY environment variable
 * 2. Bocha API (fallback) - Requires VITE_BOCHA_API_KEY environment variable
 * 3. Backend API (/api/web-search)
 * 4. DuckDuckGo API (final fallback)
 */
export const performWebSearch = async (
    query: string,
    maxResults: number = 10
): Promise<WebSearchResult[]> => {
    try {
        // Try Tavily API as primary provider
        // Use literal process.env.VITE_* so Vite can statically replace at build time
        const tavilyApiKey = process.env.VITE_TAVILY_API_KEY;

        if (tavilyApiKey) {
            try {
                const tavilyResponse = await axios.post('https://api.tavily.com/search', {
                    query,
                    max_results: maxResults,
                    search_depth: 'basic',
                    include_answer: true,
                }, {
                    headers: {
                        'Authorization': `Bearer ${tavilyApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                    validateStatus: (status) => status < 500
                });

                console.log('tavilyResults', tavilyResponse.data);

                if (tavilyResponse.data?.results) {
                    const tavilyResults: WebSearchResult[] = [];

                    // If Tavily returned an answer, add it as the first result
                    if (tavilyResponse.data.answer) {
                        tavilyResults.push({
                            title: 'AI Answer',
                            url: tavilyResponse.data.results[0]?.url || `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                            snippet: tavilyResponse.data.answer,
                            source: 'Tavily'
                        });
                    }

                    // Map Tavily results to WebSearchResult format
                    for (const item of tavilyResponse.data.results.slice(0, maxResults)) {
                        tavilyResults.push({
                            title: item.title || 'No title',
                            url: item.url,
                            snippet: item.content || '',
                            source: 'Tavily'
                        });
                    }

                    if (tavilyResults.length > 0) {
                        return tavilyResults;
                    }
                }
            } catch (tavilyError) {
                console.error('Tavily search failed, falling back:', tavilyError);
            }
        }

        // Fallback: Try Bocha API
        const bochaApiKey = process.env.VITE_BOCHA_API_KEY;

        if (bochaApiKey) {
            try {
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

                if (bochaResponse.data?.data?.webPages?.value) {
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
            } catch (bochaError) {
                console.error('Bocha search failed, falling back:', bochaError);
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
