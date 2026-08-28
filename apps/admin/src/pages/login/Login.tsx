import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  useToast,
} from '@kn/ui'
import { BookOpen, Loader2 } from '@kn/icon'
import { login } from '@/api'
import { clearTokens, getTokenPermissions, hasOperatorAccess, saveAuthUser, saveTokens } from '@/lib/auth'

export const Login = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || !password) {
      toast({ title: '请输入账号和密码', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const data = await login(account, password)
      const permissions = data.permissions ?? getTokenPermissions(data.access_token)
      if (!hasOperatorAccess({ ...data, permissions })) {
        clearTokens()
        toast({ title: '当前账号没有平台运营权限', variant: 'destructive' })
        return
      }
      saveTokens(data.access_token, data.refresh_token)
      saveAuthUser({
        userId: data.userId,
        userName: data.userName,
        account: data.account,
        avatar: data.avatar,
        authority: data.authority,
        tenantId: data.tenantId,
        permissions,
      })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      toast({
        title: '登录失败',
        description: error instanceof Error ? error.message : '请检查账号密码后重试',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-6" />
          </div>
          <CardTitle className="text-xl">KN Operations</CardTitle>
          <CardDescription>知识平台运营中心，请使用平台运营账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="account">账号</Label>
              <Input
                id="account"
                placeholder="请输入账号"
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
