import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Menu, MoreVertical } from '@kn/icon';

export interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  showMenu?: boolean;
  onBackClick?: () => void;
  onMenuClick?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  showBack = false,
  showMenu = false,
  onBackClick,
  onMenuClick,
  rightAction,
  className = '',
}) => {
  const navigate = useNavigate();

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(-1);
    }
  };

  return (
    <header
      className={`mobile-header-height bg-background border-b border-border flex items-center justify-between px-4 safe-area-top fixed top-0 left-0 right-0 z-50 ${className}`}
    >
      <div className="flex items-center gap-2 flex-1">
        {showBack && (
          <button
            onClick={handleBackClick}
            className="touch-target p-2 -ml-2 hover:bg-accent rounded-md"
            aria-label="Go back"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {showMenu && (
          <button
            onClick={onMenuClick}
            className="touch-target p-2 -ml-2 hover:bg-accent rounded-md"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        )}
        <h1 className="text-lg font-semibold truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {rightAction || (
          <button
            className="touch-target p-2 hover:bg-accent rounded-md"
            aria-label="More options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
};
