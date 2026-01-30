import React from 'react';
import { useNavigate } from '@kn/common';
import { ChevronRight, Home } from '@kn/icon';
import { Button } from '@kn/ui';
import { PageBreadcrumbItem, buildPageBreadcrumb } from '../utils/page-breadcrumb';

interface PageBreadcrumbProps {
    currentPageId: string;
    pageTree: any[];
    spaceId: string;
    currentTitle?: string;
}

export const PageBreadcrumb: React.FC<PageBreadcrumbProps> = ({
    currentPageId,
    pageTree,
    spaceId,
    currentTitle
}) => {
    // Build breadcrumb from page tree
    const breadcrumb = buildPageBreadcrumb(currentPageId, pageTree);

    const navigate = useNavigate();

    const handleBreadcrumbClick = (pageId: string, isCurrentPage: boolean) => {
        if (isCurrentPage) return; // Don't navigate if clicking on current page

        // Navigate to the selected page
        navigate(`/space-detail/${spaceId}/page/${pageId}`);
    };

    if (breadcrumb.length === 0 && currentTitle) {
        return (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>{currentTitle}</span>
            </div>
        );
    }

    return (
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5">
                {/* Home icon linking to space root */}
                <li>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1 text-muted-foreground hover:text-foreground"
                        onClick={() => navigate(`/space-detail/${spaceId}`)}
                    >
                        <Home className="h-4 w-4" />
                        <span className="sr-only">Home</span>
                    </Button>
                </li>

                {/* Render breadcrumb items */}
                {breadcrumb.map((item, index) => {
                    const isLast = index === breadcrumb.length - 1;
                    const isCurrentPage = item.id === currentPageId;

                    return (
                        <React.Fragment key={item.id}>
                            <li>
                                <ChevronRight className="h-4 w-4" />
                            </li>
                            <li>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-auto p-1 ${isCurrentPage ? 'text-foreground font-medium pointer-events-none' : 'text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => handleBreadcrumbClick(item.id, isCurrentPage)}
                                >
                                    {item.title || 'Untitled'}
                                </Button>
                            </li>
                        </React.Fragment>
                    );
                })}

                {/* Current page title if different from the last breadcrumb item */}
                {currentTitle && breadcrumb[breadcrumb.length - 1]?.title !== currentTitle && (
                    <>
                        <li>
                            <ChevronRight className="h-4 w-4" />
                        </li>
                        <li>
                            <span className="font-medium text-foreground">
                                {currentTitle}
                            </span>
                        </li>
                    </>
                )}
            </ol>
        </nav>
    );
};