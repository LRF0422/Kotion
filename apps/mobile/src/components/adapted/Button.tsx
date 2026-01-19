import React from 'react';
import { Button as UIButton } from '@kn/ui';
import type { ButtonProps as UIButtonProps } from '@kn/ui';

export interface MobileButtonProps extends Omit<UIButtonProps, 'size'> {
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'mobile';
  fullWidth?: boolean;
}

export const Button: React.FC<MobileButtonProps> = ({
  size = 'default',
  fullWidth = false,
  className = '',
  ...props
}) => {
  // Mobile-optimized sizing
  const mobileSize = size === 'mobile' ? 'default' : size;
  const mobileClass = size === 'mobile' ? 'min-h-[48px] px-6 text-base' : '';
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <UIButton
      size={mobileSize}
      className={`touch-target ${mobileClass} ${widthClass} ${className}`}
      {...props}
    />
  );
};
