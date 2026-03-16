import React from 'react';
import { EducationData } from '../../types/resume';
import { Input, Textarea, Checkbox } from '@kn/ui';

interface EducationBlockProps {
  data: EducationData;
  onChange: (data: Partial<EducationData>) => void;
}

export function EducationBlock({ data, onChange }: EducationBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input
          placeholder="学校"
          value={data.school}
          onChange={e => onChange({ school: e.target.value })}
        />
        <Input
          placeholder="学位"
          value={data.degree}
          onChange={e => onChange({ degree: e.target.value })}
        />
        <Input
          placeholder="专业"
          value={data.major}
          onChange={e => onChange({ major: e.target.value })}
        />
        <div className="flex gap-2">
          <Input
            placeholder="开始时间"
            value={data.startDate}
            onChange={e => onChange({ startDate: e.target.value })}
          />
          {!data.isOngoing && (
            <Input
              placeholder="结束时间"
              value={data.endDate || ''}
              onChange={e => onChange({ endDate: e.target.value })}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={data.isOngoing}
          onCheckedChange={checked => onChange({ isOngoing: checked as boolean })}
        />
        <span className="text-sm text-muted-foreground">进行中</span>
      </div>
      <Textarea
        placeholder="描述"
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={2}
      />
    </div>
  );
}
