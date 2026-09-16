import { useMemo, useState } from 'react'
import { Label, Textarea, cn } from '@kn/ui'

interface JsonFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  hint?: string
  /** 允许顶层为数组 */
  allowArray?: boolean
  disabled?: boolean
  className?: string
}

export interface JsonParseResult {
  ok: boolean
  error?: string
  value?: unknown
}

/** 解析并校验 JSON 文本（对象或数组）。 */
export const parseJsonObject = (text: string, allowArray = false): JsonParseResult => {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: allowArray ? [] : {} }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const isObject = parsed !== null && typeof parsed === 'object'
    if (!isObject) return { ok: false, error: '必须是 JSON 对象或数组' }
    if (!allowArray && Array.isArray(parsed)) return { ok: false, error: '必须是 JSON 对象' }
    return { ok: true, value: parsed }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'JSON 解析失败' }
  }
}

/**
 * 带实时校验的 JSON 编辑框：运营页面里所有结构化配置统一走这里，
 * 避免「保存后才发现格式错」。
 */
export const JsonField = ({
  label,
  value,
  onChange,
  rows = 10,
  placeholder,
  hint,
  allowArray = false,
  disabled,
  className,
}: JsonFieldProps) => {
  const [touched, setTouched] = useState(false)
  const result = useMemo(() => parseJsonObject(value, allowArray), [value, allowArray])
  const showError = touched && !result.ok

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label>{label}</Label>}
      <Textarea
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        className={cn('font-mono text-xs', showError && 'border-destructive focus-visible:ring-destructive')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
      />
      {showError ? (
        <p className="text-xs text-destructive">JSON 格式错误：{result.error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** 把任意对象安全地格式化成可编辑的 JSON 文本。 */
export const toJsonText = (value: unknown, fallback = '{}') => {
  if (value === undefined || value === null) return fallback
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return fallback
  }
}
