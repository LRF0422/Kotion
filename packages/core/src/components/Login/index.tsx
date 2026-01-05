import { Button } from "@kn/ui"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@kn/ui"
import { Input } from "@kn/ui"
import { Label } from "@kn/ui"
import { useForm } from "@kn/ui"
import { Link } from "react-router-dom"
import { z } from "@kn/ui"
import { zodResolver } from '@kn/ui';
import { useApi } from "../../hooks/use-api"
import { APIS } from "../../api"
import { useState } from "react"
import { useNavigator } from "../../hooks/use-navigator"
import { Loader2 } from "@kn/icon"
import { ModeToggle } from "@kn/ui"
import React from "react"
import { useUploadFile } from "../../hooks"
import { LanguageToggle } from "../../locales/LanguageToggle"
import { event } from "@kn/common"


export function Login() {

    const navigator = useNavigator()
    const [loading, setLoading] = useState(false)
    const { usePath } = useUploadFile()

    const formSchema = z.object({
        account: z.string().min(1, {
            message: 'account is required'
        }),
        password: z.string().min(1, {
            message: 'password is required'
        }),
        grantType: z.string().default('password'),
        type: z.string().default('account'),
        scope: z.string().default("all")
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema)
    })


    const onSubmit = (value: z.infer<typeof formSchema>) => {
        setLoading(true)
        useApi(APIS.LOGIN, value).then(res => {

            const { data } = res
            localStorage.setItem('knowledge-token', `bearer ${data.accessToken}`)
            localStorage.setItem("isLogin", "false")
            event.emit("REFRESH_PLUSINS")
            event.on("PLUGIN_INIT_SUCCESS", () => {
                navigator.go({
                    to: '/'
                })
            })
        }).catch(e => {
        }).finally(() => setLoading(false))
    }



    return (
        <div className="w-full lg:grid h-[100vh] lg:grid-cols-2">
            <div className=" absolute top-2 right-2 flex items-center gap-1">
                <ModeToggle />
                <LanguageToggle />
            </div>
            <div className="hidden bg-muted lg:block">
                <img
                    src={usePath("upload/20251008/70f6a0f077dc633e1be48962d06cb168.png")}
                    alt="Image"

                    className="h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
                />
            </div>
            <div className="flex items-center justify-center py-12">
                <div className="mx-auto grid w-[350px] gap-6">
                    <div className="grid gap-2 text-left">
                        <h1 className="text-3xl font-bold">嗨，近来可好？</h1>
                        <p className="text-sm text-muted-foreground">👋欢迎来到 Kn, 登录以继续</p>
                    </div>
                    <Form {...form}>
                        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                            <FormField
                                control={form.control}
                                name="account"
                                rules={{
                                    required: "2qwe",
                                }}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>账号</FormLabel>
                                        <FormControl>
                                            <Input placeholder="shadcn" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                rules={{
                                    required: true
                                }}
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            <div className="flex items-center">
                                                <Label htmlFor="password">密码</Label>
                                                <Link
                                                    to="/forgot-password"
                                                    className="ml-auto inline-block text-sm underline"
                                                >
                                                    忘记密码?
                                                </Link>
                                            </div>
                                        </FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="shadcn" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                登录
                            </Button>
                            <Button variant="outline" type="submit">使用微信登录 </Button>
                            <div className="mt-4 text-center text-sm">
                                Don&apos;t have an account?{" "}
                                <Link to="/sign-up" className="underline">
                                    注册
                                </Link>
                            </div>
                        </form>
                    </Form>
                </div>
            </div>
        </div>
    )
}

