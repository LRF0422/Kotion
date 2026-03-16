import React from 'react';
import { SkillData } from '../../types/resume';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kn/ui';

interface SkillBlockProps {
  data: SkillData;
  onChange: (data: Partial<SkillData>) => void;
}

export function SkillBlock({ data, onChange }: SkillBlockProps) {
  return (
    <div className="flex gap-3 items-center">
      <Input
        placeholder="技能名称"
        value={data.name}
        onChange={e => onChange({ name: e.target.value })}
        className="flex-1"
      />
      <Select
        value={data.level}
        onValueChange={(value: 'beginner' | 'familiar' | 'expert') => onChange({ level: value })}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="熟练程度" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="beginner">初学</SelectItem>
          <SelectItem value="familiar">熟悉</SelectItem>
          <SelectItem value="expert">精通</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder="分类（可选）"
        value={data.category}
        onChange={e => onChange({ category: e.target.value })}
        className="w-32"
      />
    </div>
  );
}
