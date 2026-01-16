import { Button, useTheme, EmptyState } from "@kn/ui";
import { Input } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { useActive } from "../../hooks";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { useSafeState } from "ahooks";
import { Edit, FigmaIcon, RefreshCw, Trash2, BoxIcon } from "@kn/icon";
import React, { useRef, useState, useEffect } from "react";


export const FigmaViewComponent: React.FC<NodeViewProps> = (props) => {

    const [url, setUrl] = useSafeState<string>()
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<any>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const hover = useActive(props.editor, "figmaView")
    const { theme } = useTheme()

    const handleClick = () => {
        if (url) {
            props.updateAttributes({
                url
            })
        }
    }

    const handleReload = () => {
        if (iframeRef.current) {
            setIsLoading(true);
            iframeRef.current.contentWindow?.location.reload();
            // Reset loading after a brief delay
            setTimeout(() => setIsLoading(false), 1000);
        }
    }

    // Handle iframe load events
    const handleIframeLoad = () => {
        setIsLoading(false);
        setError(null);
    }

    const handleIframeError = () => {
        setIsLoading(false);
        setError("Failed to load Figma content. Please check the URL.");
    }

    // Set loading state when URL changes
    useEffect(() => {
        if (props.node.attrs.url) {
            setIsLoading(true);
        }
    }, [props.node.attrs.url]);

    return <NodeViewWrapper className="leading-normal" ref={ref}>
        <Popover open={hover}>
            <PopoverTrigger className="w-full rounded-md border bg-background shadow-sm transition-shadow hover:shadow-md">
                {
                    props.node.attrs.url ?
                        <div className="bg-background rounded-md overflow-hidden border">
                            <div className="w-full h-[500px] relative">
                                {isLoading && (
                                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50">
                                        <div className="text-center">
                                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                                            <p className="mt-2 text-sm text-muted-foreground">Loading Figma...</p>
                                        </div>
                                    </div>
                                )}
                                {error && (
                                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/80">
                                        <div className="text-center p-4">
                                            <div className="text-red-500 mb-2">⚠️ Error</div>
                                            <p className="text-sm text-muted-foreground">{error}</p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="mt-2"
                                                onClick={() => {
                                                    setIsLoading(true);
                                                    iframeRef.current?.contentWindow?.location.reload();
                                                }}
                                            >
                                                Retry
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                <iframe
                                    className="w-full h-full rounded-sm"
                                    ref={iframeRef}
                                    allowFullScreen
                                    src={`https://www.figma.com/embed?&embed_host=knowledge&url=${encodeURIComponent(
                                        props.node.attrs.url + (theme ? `&theme=${theme}` : '')
                                    )}`}
                                    onLoad={handleIframeLoad}
                                    onError={handleIframeError}
                                    style={{ minHeight: '500px' }}
                                />
                            </div>
                        </div> :
                        <div className="border-2 border-dashed rounded-md p-8 text-center transition-colors hover:border-primary/50">
                            <div className="flex flex-col items-center justify-center gap-4">
                                <FigmaIcon className="h-10 w-10 text-muted-foreground" />
                                <div>
                                    <h4 className="font-medium text-lg mb-1">Embed Figma Design</h4>
                                    <p className="text-sm text-muted-foreground mb-4">Paste a Figma URL to embed the design in your document</p>
                                </div>
                                <div className="w-full max-w-md space-y-2">
                                    <Input
                                        icon={<FigmaIcon className="h-4 w-4" />}
                                        placeholder="https://www.figma.com/file/..."
                                        value={url || ''}
                                        onChange={(e) => setUrl(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleClick();
                                            }
                                        }}
                                    />
                                    <Button className="w-full" onClick={handleClick} disabled={!url || url.trim() === ''}>
                                        Embed Figma
                                    </Button>
                                </div>
                            </div>
                        </div>
                }
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="p-1 w-auto bg-popover text-popover-foreground shadow-md rounded-md" asChild>
                <div className="flex flex-row gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => props.deleteNode()}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleReload}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    </NodeViewWrapper>
}