import React from 'react';
import { AwardData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Textarea } from '@kn/ui/components/ui/textarea';

interface AwardBlockProps {
  data: AwardData;
  onChange: (data: Partial<AwardData>) => void;
}

export function AwardBlock({ data, onChange }: AwardBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input
          placeholder="证书/奖项名称"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
        />
        <Input
          placeholder="颁发机构"
          value={data.issuer}
          onChange={e => onChange({ issuer: e.target.value })}
        />
        <Input
          placeholder="获得时间"
          value={data.date}
          onChange={e => onChange({ date: e.target.value })}
        />
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
