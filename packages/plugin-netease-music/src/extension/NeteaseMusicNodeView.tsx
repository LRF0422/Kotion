import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper } from '@kn/editor';
import { NodeViewProps } from '@kn/editor';
import { Button, Input, Card, Popover, PopoverTrigger, PopoverContent } from '@kn/ui';
import { Trash2, Edit, Music, ExternalLink, MonitorPlay, Search } from '@kn/icon';
import { useActive } from '@kn/editor';
import { useNeteaseMusicConfig } from '../hooks/use-netease-config';
import { searchSongs, getSongDetail, SearchResult } from '../services/netease-client';

type MusicType = 'song' | 'playlist' | 'album';
type DisplayMode = 'player' | 'card';

/** Map musicType to the outchain player type parameter */
const musicTypeToPlayerType = (musicType: MusicType): number => {
    switch (musicType) {
        case 'playlist': return 0;
        case 'album': return 1;
        case 'song': return 2;
        default: return 2;
    }
};

/** Parse a NetEase Cloud Music URL to extract ID and type */
const parseNeteaseMusicUrl = (url: string): { musicId: string; musicType: MusicType } | null => {
    const patterns: Array<{ regex: RegExp; type: MusicType; idGroup: number }> = [
        { regex: /music\.163\.com(?:\/#)?\/song\?id=(\d+)/, type: 'song', idGroup: 1 },
        { regex: /music\.163\.com(?:\/#)?\/playlist\?id=(\d+)/, type: 'playlist', idGroup: 1 },
        { regex: /music\.163\.com(?:\/#)?\/album\?id=(\d+)/, type: 'album', idGroup: 1 },
        { regex: /y\.music\.163\.com\/m\/song\?id=(\d+)/, type: 'song', idGroup: 1 },
        { regex: /y\.music\.163\.com\/m\/playlist\?id=(\d+)/, type: 'playlist', idGroup: 1 },
        { regex: /y\.music\.163\.com\/m\/album\?id=(\d+)/, type: 'album', idGroup: 1 },
    ];

    for (const { regex, type, idGroup } of patterns) {
        const match = url.match(regex);
        if (match) {
            return { musicId: match[idGroup], musicType: type };
        }
    }
    return null;
};

/** Get the web URL for a music resource */
const getMusicWebUrl = (musicId: string, musicType: MusicType): string => {
    return `https://music.163.com/#/${musicType}?id=${musicId}`;
};

/** Get the embed player URL */
const getEmbedUrl = (musicId: string, musicType: MusicType, autoPlay = false): string => {
    const type = musicTypeToPlayerType(musicType);
    return `https://music.163.com/outchain/player?type=${type}&id=${musicId}&auto=${autoPlay ? 1 : 0}&height=66`;
};

const musicTypeLabel: Record<MusicType, string> = {
    song: '歌曲',
    playlist: '歌单',
    album: '专辑',
};

export const NeteaseMusicNodeView: React.FC<NodeViewProps> = (props) => {
    const editor = props.editor;
    const { config } = useNeteaseMusicConfig();
    const [inputUrl, setInputUrl] = useState<string>('');
    const [isEditing, setIsEditing] = useState<boolean>(!props.node.attrs.musicId);
    const [displayMode, setDisplayMode] = useState<DisplayMode>(config.defaultDisplayMode || 'player');
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const hover = useActive(editor, "neteaseMusic");

    // Search state
    const [showSearch, setShowSearch] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    const musicId = props.node.attrs.musicId;
    const musicType: MusicType = props.node.attrs.musicType || 'song';
    const title = props.node.attrs.title || '';
    const artist = props.node.attrs.artist || '';
    const coverUrl = props.node.attrs.coverUrl || '';

    useEffect(() => {
        if (musicId) {
            setIsLoading(true);
            setError(null);
        }
    }, [musicId]);

    const handleSave = () => {
        const trimmed = inputUrl.trim();
        if (!trimmed) return;

        // Try URL parsing first
        const parsed = parseNeteaseMusicUrl(trimmed);
        if (parsed) {
            props.updateAttributes({ musicId: parsed.musicId, musicType: parsed.musicType });
            setIsEditing(false);
            setError(null);
            return;
        }

        // Try as plain numeric ID (default to song)
        if (/^\d+$/.test(trimmed)) {
            props.updateAttributes({ musicId: trimmed, musicType: 'song' });
            setIsEditing(false);
            setError(null);
            return;
        }

        // Check for short links
        if (trimmed.includes('163cn.tv')) {
            setError('暂不支持短链接，请使用完整的网易云音乐链接');
            return;
        }

        setError('无法识别的链接格式，请粘贴网易云音乐歌曲/歌单/专辑链接');
    };

    const handleSearch = async () => {
        if (!searchKeyword.trim() || !config.apiBaseUrl) return;
        setSearching(true);
        try {
            const results = await searchSongs(config.apiBaseUrl, searchKeyword.trim());
            setSearchResults(results);
        } catch {
            setError('搜索失败，请检查API服务是否可用');
        }
        setSearching(false);
    };

    const handleSelectSearchResult = async (result: SearchResult) => {
        const artistName = result.artists?.map(a => a.name).join(', ') || '';
        const coverUrl = result.album?.picUrl || '';
        props.updateAttributes({
            musicId: String(result.id),
            musicType: 'song',
            title: result.name,
            artist: artistName,
            coverUrl,
        });
        setShowSearch(false);
        setIsEditing(false);
        setError(null);
    };

    const handleIframeLoad = () => {
        setIsLoading(false);
        setError(null);
    };

    const handleIframeError = () => {
        setIsLoading(false);
        setError('播放器加载失败，请检查音乐ID是否正确');
    };

    return (
        <NodeViewWrapper className="my-4">
            <Popover open={hover}>
                <PopoverTrigger className="w-full">
                    <Card className="w-full overflow-hidden border rounded-md shadow-sm transition-shadow hover:shadow-md">
                        {!musicId ? (
                            // Input form when no music ID is set
                            <div className="p-6 text-center">
                                <div className="flex flex-col items-center justify-center gap-4">
                                    <Music className="h-10 w-10 text-muted-foreground" />
                                    <div>
                                        <h4 className="font-medium text-lg mb-1">嵌入网易云音乐</h4>
                                        <p className="text-sm text-muted-foreground mb-4">粘贴网易云音乐链接或输入歌曲ID</p>
                                    </div>

                                    <div className="w-full max-w-md space-y-2">
                                        <Input
                                            placeholder="https://music.163.com/#/song?id=xxx 或歌曲ID"
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
                                                嵌入音乐
                                            </Button>

                                            {config.apiBaseUrl && (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setShowSearch(!showSearch)}
                                                >
                                                    <Search className="h-4 w-4 mr-1" />
                                                    搜索
                                                </Button>
                                            )}

                                            <Button
                                                variant="outline"
                                                onClick={() => props.deleteNode()}
                                            >
                                                取消
                                            </Button>
                                        </div>

                                        {/* Search Panel */}
                                        {showSearch && (
                                            <div className="mt-3 border rounded-md p-3 space-y-2">
                                                <div className="flex gap-2">
                                                    <Input
                                                        placeholder="搜索歌曲名或歌手..."
                                                        value={searchKeyword}
                                                        onChange={(e) => setSearchKeyword(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSearch();
                                                        }}
                                                    />
                                                    <Button size="sm" onClick={handleSearch} disabled={searching || !searchKeyword.trim()}>
                                                        {searching ? '搜索中...' : '搜索'}
                                                    </Button>
                                                </div>
                                                {searchResults.length > 0 && (
                                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                                        {searchResults.map((result) => (
                                                            <button
                                                                key={result.id}
                                                                className="w-full flex items-center gap-3 p-2 rounded hover:bg-accent/50 text-left transition-colors"
                                                                onClick={() => handleSelectSearchResult(result)}
                                                            >
                                                                {result.album?.picUrl ? (
                                                                    <img src={`${result.album.picUrl}?param=40y40`} className="w-10 h-10 rounded flex-shrink-0" />
                                                                ) : (
                                                                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                                                        <Music className="h-5 w-5 text-muted-foreground" />
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm font-medium truncate">{result.name}</div>
                                                                    <div className="text-xs text-muted-foreground truncate">
                                                                        {result.artists?.map(a => a.name).join(', ')}
                                                                        {result.album?.name && ` · ${result.album.name}`}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Display the embedded music
                            <div className="relative group">
                                {displayMode === 'player' ? (
                                    // Embed player mode
                                    <div className="w-full bg-background flex items-center justify-center">
                                        {isLoading && (
                                            <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50">
                                                <div className="text-center">
                                                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
                                                    <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
                                                </div>
                                            </div>
                                        )}

                                        <iframe
                                            ref={iframeRef}
                                            src={getEmbedUrl(musicId, musicType, config.autoPlay)}
                                            className="w-full border-0"
                                            style={{ height: '86px' }}
                                            onLoad={handleIframeLoad}
                                            onError={handleIframeError}
                                        />
                                    </div>
                                ) : (
                                    // Card mode
                                    <a
                                        href={getMusicWebUrl(musicId, musicType)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors cursor-pointer no-underline text-foreground"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {coverUrl ? (
                                            <img
                                                src={coverUrl}
                                                alt={title || '封面'}
                                                className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                                            />
                                        ) : (
                                            <div className="w-16 h-16 rounded-md bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0">
                                                <Music className="h-8 w-8 text-white" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">
                                                {title || `${musicTypeLabel[musicType]} ${musicId}`}
                                            </div>
                                            {artist && (
                                                <div className="text-sm text-muted-foreground truncate">{artist}</div>
                                            )}
                                            <div className="text-xs text-muted-foreground mt-1">
                                                网易云音乐 · {musicTypeLabel[musicType]}
                                            </div>
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    </a>
                                )}

                                {isEditing && (
                                    <div className="absolute inset-0 flex items-center justify-center z-20 bg-popover">
                                        <div className="p-4 rounded-md shadow-lg max-w-sm w-full mx-4">
                                            <h3 className="font-medium mb-3">编辑音乐</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-sm font-medium mb-1 block">标题</label>
                                                    <Input
                                                        value={title}
                                                        onChange={(e) => props.updateAttributes({ title: e.target.value })}
                                                        placeholder="歌曲名称"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-medium mb-1 block">歌手</label>
                                                    <Input
                                                        value={artist}
                                                        onChange={(e) => props.updateAttributes({ artist: e.target.value })}
                                                        placeholder="歌手名称"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-medium mb-1 block">封面URL</label>
                                                    <Input
                                                        value={coverUrl}
                                                        onChange={(e) => props.updateAttributes({ coverUrl: e.target.value })}
                                                        placeholder="https://..."
                                                    />
                                                </div>
                                                <div className="flex gap-2 pt-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setIsEditing(false)}
                                                    >
                                                        完成
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setIsEditing(false)}
                                                    >
                                                        取消
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
                        {musicId && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    title={displayMode === 'player' ? '切换到卡片模式' : '切换到播放器模式'}
                                    onClick={() => setDisplayMode(displayMode === 'player' ? 'card' : 'player')}
                                >
                                    <MonitorPlay className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setIsEditing(!isEditing)}
                                >
                                    <Edit className="h-4 w-4" />
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
