import { APIS } from "../../api"
import { Button } from "@repo/ui"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@repo/ui"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@repo/ui"
import { Input } from "@repo/ui"
import { useApi } from "../../hooks/use-api"
import { useNavigator } from "../../hooks/use-navigator"
import { ModeToggle } from "@repo/ui"
import { upload } from "../../utils/file-utils"
import { zodResolver } from "@repo/ui"
import { Plus } from "@repo/icon"
import { useForm } from "@repo/ui"
import { Link } from "react-router-dom"
import { z } from "@repo/ui"
import React from "react"

export const description =
    "A sign up form with first name, last name, email and password inside a card. There's an option to sign up with GitHub and a link to login if you already have an account"

export function SignUpForm() {

    const navigator = useNavigator()


    const formSchema = z.object({
        avatar: z.string(),
        account: z.string().min(1, {
            message: 'account is required'
        }),
        password: z.string().min(1, {
            message: 'password is required'
        }),
        name: z.string()
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema)
    })

    const handleSubmit = () => {
        const value = form.getValues()
        useApi(APIS.REGISTER, null, value).then((res) => {
            navigator.go({
                to: '/login'
            })
        })
    }

    return (
        <div className="h-screen w-screen flex items-center justify-center">
            <Card className="mx-auto w-[400px]">
                <CardHeader>
                    <CardTitle className="text-xl">注册</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSubmit)}>
                            <FormField
                                control={form.control}
                                name="avatar"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>头像</FormLabel>
                                        <div className="flex justify-center items-center w-[60px] h-[60px] border border-dashed rounded-sm hover:bg-muted" onClick={() => {
                                            upload().then(res => {
                                                field.onChange(res.data.name)
                                            })
                                        }}>
                                            {
                                                field.value ?
                                                    <img src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${field.value}`} /> : <Plus />
                                            }
                                        </div>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>昵称</FormLabel>
                                        <FormControl>
                                            <Input {...field} required />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="account"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>账号</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="email" required />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>密码</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="password" required />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <div className="flex flex-col gap-4 mt-4">
                                <Button type="submit" className="w-full">
                                    新建账号
                                </Button>
                            </div>
                        </form>
                    </Form>
                    <div className="mt-4 text-center text-sm">
                        已经拥有账号?{" "}
                        <Link to="/login" className="underline">
                            登录
                        </Link>
                    </div>
                </CardContent>
            </Card>
            <div className=" absolute top-2 right-2">
                <ModeToggle />
            </div>
        </div >
    )
}
