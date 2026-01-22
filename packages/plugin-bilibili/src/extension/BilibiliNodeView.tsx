import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@kn/editor';
import { NodeViewProps } from '@kn/editor';
import { Button, Input, Card, Popover, PopoverTrigger, PopoverContent } from '@kn/ui';
import { Trash2, Edit, RefreshCw, Play, Clock, RiBilibiliFill } from '@kn/icon';
import { useActive } from '@kn/editor';

const isValidBvid = (bvid: string): boolean => {
    return /^BV[a-zA-Z0-9]{10}$/.test(bvid);
};

const extractBvid = (url: string): string | null => {
    // Match various Bilibili URL formats
    const patterns = [
        /BV[a-zA-Z0-9]{10}/,
        /av(\d+)/,
        /video\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            console.log('Match found:', match);
            let result = match[0];
            // If it's an av number, convert to BV (this is simplified - in reality, av and BV mapping is more complex)
            if (/^\d+$/.test(result)) {
                return result;
            }
            return result.startsWith('BV') ? result : `BV${result}`;
        }
    }
    return null;
};

export const BilibiliNodeView: React.FC<NodeViewProps> = (props) => {
    const editor = props.editor
    const [inputUrl, setInputUrl] = useState<string>('');
    const [startTime, setStartTime] = useState<number>(props.node.attrs.startTime || 0);
    const [isEditing, setIsEditing] = useState<boolean>(!props.node.attrs.bvid);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const hover = useActive(editor, "bilibili");

    const bvid = props.node.attrs.bvid;

    useEffect(() => {
        if (bvid) {
            setIsLoading(true);
            setError(null);
        }
    }, [bvid]);

    const handleSave = () => {
        if (inputUrl.trim()) {
            const extractedBvid = extractBvid(inputUrl.trim());
            if (extractedBvid && isValidBvid(extractedBvid)) {
                props.updateAttributes({ bvid: extractedBvid, startTime });
                setIsEditing(false);
            } else {
                setError('Invalid Bilibili video URL or BV ID');
            }
        }
    };

    const handleReload = () => {
        if (iframeRef.current) {
            setIsLoading(true);
            iframeRef.current.contentWindow?.location.reload();
            setTimeout(() => setIsLoading(false), 1000);
        }
    };

    const handleIframeLoad = () => {
        setIsLoading(false);
        setError(null);
    };

    const handleIframeError = () => {
        setIsLoading(false);
        setError("Failed to load Bilibili video. Please check the BV ID or URL.");
    };

    const getEmbedUrl = (): string => {
        if (!bvid) return '';

        const baseUrl = `https://player.bilibili.com/player.html`;
        const params = new URLSearchParams({
            bvid: bvid,
            autoplay: '0',
        });

        if (startTime > 0) {
            params.append('start', startTime.toString());
        }

        return `${baseUrl}?${params.toString()}`;
    };

    return (
        <NodeViewWrapper className="my-4">
            <Popover open={hover}>
                <PopoverTrigger className="w-full">
                    <Card className="w-full overflow-hidden border rounded-md shadow-sm transition-shadow hover:shadow-md">
                        {!bvid ? (
                            // Input form when no BV ID is set
                            <div className="p-6 text-center">
                                <div className="flex flex-col items-center justify-center gap-4">
                                    <RiBilibiliFill className="h-10 w-10 text-muted-foreground" />
                                    <div>
                                        <h4 className="font-medium text-lg mb-1">Embed Bilibili Video</h4>
                                        <p className="text-sm text-muted-foreground mb-4">Paste a Bilibili URL or BV ID to embed the video</p>
                                    </div>

                                    <div className="w-full max-w-md space-y-2">
                                        <Input
                                            placeholder="https://www.bilibili.com/video/BVxxxxxxxxx or BVxxxxxxxxx"
                                            value={inputUrl}
                                            onChange={(e) => setInputUrl(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleSave();
                                                }
                                            }}
                                        />

                                        {error && (
                                            <p className="text-sm text-red-500">{error}</p>
                                        )}

                                        <div className="flex gap-2">
                                            <Button
                                                className="flex-1"
                                                onClick={handleSave}
                                                disabled={!inputUrl.trim()}
                                            >
                                                Embed Video
                                            </Button>

                                            <Button
                                                variant="outline"
                                                onClick={() => props.deleteNode()}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Display the embedded video
                            <div className="relative group">
                                <div className="w-full aspect-video bg-black flex items-center justify-center">
                                    {isLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50">
                                            <div className="text-center">
                                                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                                                <p className="mt-2 text-sm text-muted-foreground">Loading Bilibili video...</p>
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
                                        ref={iframeRef}
                                        src={getEmbedUrl()}
                                        allowFullScreen={true}
                                        className="w-full h-full"
                                        onLoad={handleIframeLoad}
                                        onError={handleIframeError}
                                    />
                                </div>

                                {isEditing && (
                                    <div className="absolute inset-0 flex items-center justify-center z-20 bg-popover">
                                        <div className="p-4 rounded-md shadow-lg max-w-xs w-full mx-4">
                                            <h3 className="font-medium mb-2">Edit Video Settings</h3>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-sm font-medium mb-1 block">Start Time (seconds)</label>
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            value={startTime}
                                                            onChange={(e) => setStartTime(Number(e.target.value))}
                                                            placeholder="0"
                                                            className="w-24"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 pt-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => {
                                                            props.updateAttributes({ bvid, startTime });
                                                            setIsEditing(false);
                                                        }}
                                                    >
                                                        Save
                                                    </Button>

                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setIsEditing(false)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </PopoverTrigger>

                <PopoverContent side="top" align="start" className="p-1 w-auto bg-popover text-popover-foreground shadow-md rounded-md" asChild>
                    <div className="flex flex-row gap-1">
                        {bvid && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setIsEditing(!isEditing)}
                                >
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={handleReload}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => props.deleteNode()}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </NodeViewWrapper>
    );
};