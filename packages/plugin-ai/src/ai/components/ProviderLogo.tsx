import React from 'react'
import { cn } from '@kn/ui'

/**
 * Vendor marks for the model picker.
 *
 * Every entry is a single 24×24 glyph tinted with the vendor's brand colour, so
 * a catalog that mixes Qwen / GLM / DeepSeek reads at a glance instead of
 * showing a wall of plain text. A provider the table does not know still gets a
 * tinted monogram tile (same provider ⇒ same tile) rather than no mark at all.
 */
export interface ProviderBrand {
    /** Human-readable vendor name, used for the accessible label. */
    label: string
    /** Brand colour the glyph is tinted with. */
    color: string
    /** 24×24 glyph outline. Omitted for monogram-only brands. */
    path?: string
    /** Letter(s) drawn in the tile when the brand has no glyph. */
    monogram?: string
}

const BRANDS: Record<string, ProviderBrand> = {
    deepseek: {
        label: 'DeepSeek',
        color: '#4D6BFE',
        path: 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45',
    },
    qwen: {
        label: 'Qwen',
        color: '#615CED',
        path: 'M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z',
    },
    glm: {
        // 智谱 has no glyph in the icon sets this app already ships, so it gets a
        // tinted monogram tile — still recognisable next to the other vendors.
        label: 'GLM (智谱)',
        color: '#3B5BFE',
        monogram: 'G',
    },
    openai: {
        label: 'OpenAI',
        color: '#10A37F',
        path: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
    },
    anthropic: {
        label: 'Anthropic',
        color: '#D97757',
        path: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
    },
    gemini: {
        label: 'Google Gemini',
        color: '#4285F4',
        path: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
    },
    moonshot: {
        label: 'Moonshot AI',
        color: '#7C5CFF',
        path: 'm1.053 16.91 9.538 2.55a21 20.981 0 0 0 .06 2.031l5.956 1.592a12 11.99 0 0 1-15.554-6.172m-1.02-5.79 11.352 3.035a21 20.981 0 0 0-.469 2.01l10.817 2.89a12 11.99 0 0 1-1.845 2.004L.658 15.918a12 11.99 0 0 1-.625-4.796m1.593-5.146L13.573 9.17a21 20.981 0 0 0-1.01 1.874l11.297 3.02a21 20.981 0 0 1-.67 2.362l-11.55-3.087L.125 10.26a12 11.99 0 0 1 1.499-4.285ZM6.067 1.58l11.285 3.016a21 20.981 0 0 0-1.688 1.719l7.824 2.091a21 20.981 0 0 1 .513 2.664L2.107 5.218a12 11.99 0 0 1 3.96-3.638M21.68 4.866 7.222 1.003A12 11.99 0 0 1 21.68 4.866',
    },
    mistral: {
        label: 'Mistral AI',
        color: '#FA520F',
        path: 'M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z',
    },
}

/**
 * Provider ids are free-form config keys (`agent.providers.<name>`), so every
 * spelling a deployment is likely to use maps onto one brand.
 */
const ALIASES: Record<string, string> = {
    deepseek: 'deepseek',
    'deep-seek': 'deepseek',
    qwen: 'qwen',
    qwen2: 'qwen',
    tongyi: 'qwen',
    dashscope: 'qwen',
    alibaba: 'qwen',
    glm: 'glm',
    chatglm: 'glm',
    zhipu: 'glm',
    zhipuai: 'glm',
    zai: 'glm',
    bigmodel: 'glm',
    openai: 'openai',
    azure: 'openai',
    'azure-openai': 'openai',
    gpt: 'openai',
    anthropic: 'anthropic',
    claude: 'anthropic',
    gemini: 'gemini',
    google: 'gemini',
    googlegemini: 'gemini',
    vertex: 'gemini',
    'vertex-ai': 'gemini',
    moonshot: 'moonshot',
    moonshotai: 'moonshot',
    kimi: 'moonshot',
    mistral: 'mistral',
    mistralai: 'mistral',
}

/** Provider key the brand table is indexed by, or '' when unusable. */
export function providerBrandKey(provider?: string): string {
    const key = String(provider ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_.]+/g, '-')
    if (!key) return ''
    // The picker's bucket for models whose provider the backend did not name.
    if (key === 'other') return ''
    if (ALIASES[key]) return ALIASES[key]
    // Vendors commonly ship as `moonshot-ai` / `zhipu-ai` style keys.
    const stripped = key.replace(/-ai$/, '')
    return ALIASES[stripped] ?? stripped
}

/**
 * Brand mark for a provider, or `undefined` when the catalog did not name one
 * (the group bucket "other") — rendering nothing is better than a fake mark.
 */
export function providerBrand(provider?: string): ProviderBrand | undefined {
    const key = providerBrandKey(provider)
    if (!key) return undefined
    const brand = BRANDS[key]
    if (brand) return brand
    // Unknown but named provider: a deterministic tinted tile keeps two vendors
    // visually distinct instead of both looking like plain rows.
    const name = String(provider).trim()
    return {
        label: name,
        color: '#64748B',
        monogram: name.slice(0, 1).toUpperCase(),
    }
}

interface ProviderLogoProps {
    /** Raw `ModelInfo.provider` value (or the group key). */
    provider?: string
    /** Sizing overrides; defaults to `h-3.5 w-3.5`. */
    className?: string
    /** Rendered instead of the mark when the provider has no brand. */
    fallback?: React.ReactNode
}

export const ProviderLogo: React.FC<ProviderLogoProps> = ({ provider, className, fallback }) => {
    const brand = providerBrand(provider)
    if (!brand) return <>{fallback ?? null}</>
    // Merged with twMerge so a caller can shrink the mark for dense rows.
    const sizeClass = cn('h-3.5 w-3.5 shrink-0', className)

    if (brand.path) {
        return (
            <svg
                role="img"
                aria-label={brand.label}
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ color: brand.color }}
                className={sizeClass}
            >
                <path d={brand.path} />
            </svg>
        )
    }

    return (
        <span
            role="img"
            aria-label={brand.label}
            style={{ backgroundColor: brand.color }}
            className={cn(
                'flex items-center justify-center rounded-[3px] text-[8px] font-bold leading-none text-white',
                sizeClass,
            )}
        >
            {brand.monogram}
        </span>
    )
}
