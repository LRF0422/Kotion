import React from 'react';
import { StyleConfig } from '../../types/resume';
import { Card } from '@kn/ui/components/ui/card';
import { Button } from '@kn/ui/components/ui/button';

interface StylePanelProps {
  style: StyleConfig;
  onChange: (style: Partial<StyleConfig>) => void;
}

const themes = [
  { id: 'blue', color: '#3b82f6', label: '蓝色' },
  { id: 'green', color: '#22c55e', label: '绿色' },
  { id: 'purple', color: '#a855f7', label: '紫色' },
  { id: 'dark', color: '#1f2937', label: '深色' },
  { id: 'light', color: '#f3f4f6', label: '浅色' }
] as const;

const layouts = [
  { id: 'single', label: '单栏' },
  { id: 'double', label: '双栏' },
  { id: 'triple', label: '三栏' }
] as const;

const spacings = [
  { id: 'compact', label: '紧凑' },
  { id: 'normal', label: '标准' },
  { id: 'loose', label: '宽松' }
] as const;

export function StylePanel({ style, onChange }: StylePanelProps) {
  return (
    <Card className="p-4 space-y-6 w-72">
      <div>
        <h3 className="font-medium mb-3">主题色</h3>
        <div className="flex gap-2">
          {themes.map(theme => (
            <button
              key={theme.id}
              className={`w-8 h-8 rounded-full border-2 ${
                style.theme === theme.id ? 'border-primary' : 'border-transparent'
              }`}
              style={{ backgroundColor: theme.color }}
              onClick={() => onChange({ theme: theme.id })}
              title={theme.label}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">布局</h3>
        <div className="flex gap-2">
          {layouts.map(layout => (
            <Button
              key={layout.id}
              variant={style.layout === layout.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ layout: layout.id })}
            >
              {layout.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">间距</h3>
        <div className="flex gap-2">
          {spacings.map(spacing => (
            <Button
              key={spacing.id}
              variant={style.spacing === spacing.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ spacing: spacing.id })}
            >
              {spacing.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">字体</h3>
        <select
          className="w-full p-2 border rounded"
          value={style.titleFont}
          onChange={e => onChange({ titleFont: e.target.value })}
        >
          <option value="Inter">Inter</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
        </select>
      </div>
    </Card>
  );
}
