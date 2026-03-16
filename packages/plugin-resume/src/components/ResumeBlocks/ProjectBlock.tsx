import React from 'react';
import { ProjectData } from '../../types/resume';
import { Input, Textarea } from '@kn/ui';

interface ProjectBlockProps {
  data: ProjectData;
  onChange: (data: Partial<ProjectData>) => void;
}

export function ProjectBlock({ data, onChange }: ProjectBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input
          placeholder="项目名称"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
        />
        <Input
          placeholder="时间"
          value={data.time}
          onChange={e => onChange({ time: e.target.value })}
        />
        <Input
          placeholder="角色"
          value={data.role}
          onChange={e => onChange({ role: e.target.value })}
        />
      </div>
      <Input
        placeholder="技术栈（逗号分隔）"
        value={data.techStack?.join(', ') || ''}
        onChange={e => onChange({ techStack: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
      />
      <Textarea
        placeholder="项目描述"
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={3}
      />
    </div>
  );
}
