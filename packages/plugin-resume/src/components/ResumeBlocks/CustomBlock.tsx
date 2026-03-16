import React from 'react';
import { CustomData } from '../../types/resume';
import { Textarea } from '@kn/ui/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@kn/ui/components/ui/select';

interface CustomBlockProps {
  data: CustomData;
  onChange: (data: Partial<CustomData>) => void;
}

export function CustomBlock({ data, onChange }: CustomBlockProps) {
  return (
    <div className="space-y-2">
      <Select
        value={data.style}
        onValueChange={(value: 'normal' | 'heading' | 'quote') => onChange({ style: value })}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="样式" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="normal">普通</SelectItem>
          <SelectItem value="heading">标题</SelectItem>
          <SelectItem value="quote">引用</SelectItem>
        </SelectContent>
      </Select>
      <Textarea
        placeholder="自定义内容"
        value={data.content}
        onChange={e => onChange({ content: e.target.value })}
        rows={4}
      />
    </div>
  );
}
