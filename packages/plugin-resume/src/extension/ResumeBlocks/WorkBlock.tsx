import React from 'react';
import { WorkData } from '../../types/resume';
import { Input, Textarea, Checkbox } from '@kn/ui';

interface WorkBlockProps {
  data: WorkData;
  onChange: (data: Partial<WorkData>) => void;
}

export function WorkBlock({ data, onChange }: WorkBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input
          placeholder="公司名称"
          value={data.company}
          onChange={e => onChange({ company: e.target.value })}
        />
        <Input
          placeholder="职位"
          value={data.position}
          onChange={e => onChange({ position: e.target.value })}
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
        <span className="text-sm text-muted-foreground">目前在职</span>
      </div>
      <Textarea
        placeholder="工作描述"
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={3}
      />
    </div>
  );
}
