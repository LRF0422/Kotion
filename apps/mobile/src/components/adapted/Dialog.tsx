import React from 'react';
import {
  Dialog as UIDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@kn/ui';
import { useIsMobile } from '../../hooks';

export interface MobileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  fullScreen?: boolean;
}

export const Dialog: React.FC<MobileDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  fullScreen,
}) => {
  const isMobile = useIsMobile();
  const shouldBeFullScreen = fullScreen ?? isMobile;

  return (
    <UIDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={shouldBeFullScreen ? 'h-full max-h-screen w-full max-w-full m-0 rounded-none' : ''}
      >
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </UIDialog>
  );
};
