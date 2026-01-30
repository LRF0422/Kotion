import React, { useState, useRef, useEffect, useId, memo } from "react";
import mermaid, { type MermaidConfig } from "mermaid";
import { Button } from "@kn/ui"
import { CopyIcon, DownloadIcon } from "@kn/icon"
// styles
// import "./styles.css";
import { uuidv4 } from "lib0/random";

// Download SVG function
const handleDownloadSvg = (
    mermaidRef: React.RefObject<HTMLDivElement | null>
) => {
    if (mermaidRef.current) {
        const svgElement = mermaidRef.current.querySelector("svg");
        if (svgElement) {
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], {
                type: "image/svg+xml;charset=utf-8",
            });
            const svgUrl = URL.createObjectURL(svgBlob);
            const downloadLink = document.createElement("a");
            downloadLink.href = svgUrl;
            downloadLink.download = "mermaid-diagram.svg";
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(svgUrl);
        }
    }
};

// Simple component based approach for rendering
export interface RenderMermaidProps {
    mermaidCode: string;
    errorComponent?: React.ComponentType<{ error: string; mermaidCode: string }>;
    disableDownload?: boolean;
    disableCopy?: boolean;
    downloadComponent?: React.ComponentType<{ onClick: () => void }>;
    copyComponent?: React.ComponentType<{ onClick: () => void }>;
    mermaidConfig?: MermaidConfig;
    renderCode?: React.ComponentType<{ code: string }>;
}

const CodeRenderer: React.FC<{ children: string }> = ({ children }) => (
    <pre className="mermaid-code-renderer">
        <code>{children}</code>
    </pre>
);

function RenderMermaid({
    mermaidCode,
    errorComponent: ErrorComponent,
    disableDownload = false,
    disableCopy = false,
    downloadComponent: DownloadComponent,
    copyComponent: CopyComponent,
    mermaidConfig,
    renderCode: RenderCode,
}: RenderMermaidProps) {
    const [error, setError] = useState<string | null>(null);
    const id = uuidv4();
    const mermaidRef = useRef<HTMLDivElement | null>(null);
    const handleCopyCode = () => {
        navigator.clipboard.writeText(mermaidCode ?? "");
    };

    useEffect(() => {
        const currentRef = mermaidRef.current;
        // Flag to prevent updates after the component is unmounted
        let isMounted = true;
        const renderDiagram = async () => {
            // Guard against empty or whitespace-only code
            if (!mermaidCode?.trim()) {
                // if empty code, clear element.
                if (mermaidRef.current) mermaidRef.current.innerHTML = "";
                return;
            }
            setError(null);
            try {
                // Always initialize Mermaid inside the effect for consistency
                mermaid.initialize({
                    startOnLoad: false,
                    suppressErrorRendering: true,
                    theme: "default", // Ensure theme is set
                    themeCSS: ".node rect { stroke: #3b82f6; stroke-width: 2px; fill: #eff6ff; } .edgePath path { stroke: #6b7280; stroke-width: 2px; } .cluster rect { stroke: #818cf8; stroke-width: 2px; fill: #e0e7ff; } .label { font-family: 'Inter', sans-serif; font-weight: 500; }", // Custom CSS for better styling
                    ...mermaidConfig, // Allow user overrides
                });
                const { svg } = await mermaid.render(`mermaid-${id}`, mermaidCode);

                // Only update the DOM if the component is still mounted
                if (isMounted && mermaidRef.current) {
                    mermaidRef.current.innerHTML = svg;
                }
            } catch (err) {
                if (isMounted) {
                    setError((err as Error).message);
                }
            }
        };

        renderDiagram();
        // **THIS IS THE CRUCIAL CLEANUP FUNCTION**
        return () => {
            isMounted = false;
            if (currentRef) {
                currentRef.innerHTML = ""; // Clear the SVG on unmount
            }
        };
    }, [mermaidCode, id, mermaidConfig]);

    if (error) {
        // Use custom error component if provided
        if (ErrorComponent) {
            return <ErrorComponent error={error} mermaidCode={mermaidCode} />;
        }
        // Default error rendering
        return (
            <div className="mermaid-error-container w-full rounded-lg border bg-card text-card-foreground shadow-sm">
                <div className="mermaid-actions p-2">
                    {!disableCopy &&
                        (CopyComponent ? (
                            <CopyComponent onClick={handleCopyCode} />
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleCopyCode}
                                className="mermaid-action-button btn-copy h-8 w-8 p-1.5"
                            >
                                <CopyIcon className="h-4 w-4" />
                            </Button>
                        ))}
                </div>
                <div className="p-4 bg-destructive/10 text-destructive rounded-b-lg">
                    <p className="text-sm font-medium mb-2">Error rendering diagram:</p>
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                        {error}
                    </pre>
                </div>
            </div>
        );
    }

    return (
        <div className="mermaid-renderer w-full h-full justify-center relative" key={mermaidCode}>
            {/* copy code and download buttons */}
            <div className="mermaid-actions absolute top-1 left-1 flex items-center ">
                {!disableCopy &&
                    (CopyComponent ? (
                        <CopyComponent onClick={handleCopyCode} />
                    ) : (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleCopyCode}
                            className="mermaid-action-button btn-copy h-8 w-8 p-1.5"
                        >
                            <CopyIcon className="h-4 w-4" />
                        </Button>
                    ))}
                {!disableDownload &&
                    (DownloadComponent ? (
                        <DownloadComponent onClick={() => handleDownloadSvg(mermaidRef)} />
                    ) : (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadSvg(mermaidRef)}
                            className="mermaid-action-button btn-download h-8 w-8 p-1.5"
                        >
                            <DownloadIcon className="h-4 w-4" />
                        </Button>
                    ))}
            </div>
            <div ref={mermaidRef} className="mermaid-diagram flex justify-center items-center" />
        </div>
    );
}

/**
 * RenderMermaid (exported)
 * @param {object} props - Component props
 * @param {string} props.mermaidCode - Mermaid diagram source string.
 * @param {React.ComponentType<{error:string; mermaidCode:string}>} [props.errorComponent] - Optional custom error UI.
 * @param {boolean} [props.disableDownload] - When true, hides the download action.
 * @param {boolean} [props.disableCopy] - When true, hides the copy action.
 * @param {React.ComponentType<{onClick: ()=>void}>} [props.downloadComponent] - Optional custom download button component.
 * @param {React.ComponentType<{onClick: ()=>void}>} [props.copyComponent] - Optional custom copy button component.
 * @param {MermaidConfig} [props.mermaidConfig] - Partial mermaid config passed to mermaid.initialize.
 * @param {React.ComponentType<{code:string}>} [props.renderCode] - Optional renderer for displaying the raw code.
 * @return {JSX.Element} The rendered Mermaid diagram or error component.
 */
const RenderMermaidExport = memo(
    RenderMermaid
) as unknown as React.FC<RenderMermaidProps>;

export default RenderMermaidExport;