import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from '@kn/ui'
import { Plus, ShieldCheck, Pencil, Users } from '@kn/icon'
import { PageHeader } from '@/components/PageHeader'
import { MOCK_ROLES } from '@/mock/data'

export const RoleList = () => {
  const { toast } = useToast()

  return (
    <div>
      <PageHeader
        title="角色权限"
        description="配置角色及其权限范围，内置角色不可删除"
        actions={(
          <Button onClick={() => toast({ title: '新建角色', description: '接入后端 RoleController 后开放' })}>
            <Plus className="mr-1 size-4" />
            新建角色
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {MOCK_ROLES.map((role) => (
          <Card key={role.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{role.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{role.code}</CardDescription>
                  </div>
                </div>
                {role.builtin && <Badge variant="secondary">内置</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="size-4" />
                  {role.userCount} 位用户
                </span>
                <span>权限范围：{role.scope}</span>
              </div>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {role.permissions.map((permission) => (
                  <Badge key={permission} variant="outline">{permission}</Badge>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast({ title: `编辑「${role.name}」`, description: '权限编辑接入后端后开放' })}
              >
                <Pencil className="mr-1 size-3.5" />
                编辑权限
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
