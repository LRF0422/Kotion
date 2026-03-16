import React from 'react';
import { BasicInfoData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Textarea } from '@kn/ui/components/ui/textarea';

interface BasicInfoBlockProps {
  data: BasicInfoData;
  onChange: (data: Partial<BasicInfoData>) => void;
}

export function BasicInfoBlock({ data, onChange }: BasicInfoBlockProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 items-start">
        {data.avatar && (
          <img src={data.avatar} alt="avatar" className="w-16 h-16 rounded-full object-cover" />
        )}
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Input
            placeholder="姓名"
            value={data.name}
            onChange={e => onChange({ name: e.target.value })}
          />
          <Input
            placeholder="职位"
            value={data.summary}
            onChange={e => onChange({ summary: e.target.value })}
          />
          <Input
            placeholder="邮箱"
            type="email"
            value={data.email}
            onChange={e => onChange({ email: e.target.value })}
          />
          <Input
            placeholder="手机"
            value={data.phone}
            onChange={e => onChange({ phone: e.target.value })}
          />
          <Input
            placeholder="地址"
            className="col-span-2"
            value={data.address}
            onChange={e => onChange({ address: e.target.value })}
          />
        </div>
      </div>
      <Textarea
        placeholder="个人简介"
        value={data.summary}
        onChange={e => onChange({ summary: e.target.value })}
        rows={3}
      />
    </div>
  );
}
