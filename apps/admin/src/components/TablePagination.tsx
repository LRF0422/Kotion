import { Button } from '@kn/ui'
import { ChevronLeft, ChevronRight } from '@kn/icon'

interface TablePaginationProps {
  current: number
  pages: number
  total: number
  onChange: (page: number) => void
}

export const TablePagination = ({ current, pages, total, onChange }: TablePaginationProps) => {
  const totalPages = Math.max(pages, 1)
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span>共 {total} 条 · 第 {current} / {totalPages} 页</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => onChange(current - 1)}>
          <ChevronLeft className="size-4" />
          上一页
        </Button>
        <Button variant="outline" size="sm" disabled={current >= totalPages} onClick={() => onChange(current + 1)}>
          下一页
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
