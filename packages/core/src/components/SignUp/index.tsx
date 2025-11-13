import { APIS } from "../../api"
import { Button, CardDescription } from "@kn/ui"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@kn/ui"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@kn/ui"
import { Input } from "@kn/ui"
import { useApi } from "../../hooks/use-api"
import { useNavigator } from "../../hooks/use-navigator"
import { ModeToggle } from "@kn/ui"
import { zodResolver } from "@kn/ui"
import { useForm } from "@kn/ui"
import { Link } from "react-router-dom"
import { z } from "@kn/ui"
import React from "react"
import { LanguageToggle } from "../../locales/LanguageToggle"

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
    }).default({
        avatar: 'upload/20241029/4d04038680ea9dce94495ad5c226e3c0.png',
        account: '',
        password: '',
        name: ''
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
        <div className="h-screen w-screen flex flex-col gap-1 items-center justify-center">
            <div className="text-left w-[400px]">
                <div className="text-2xl font-bold">Hi👋，欢迎使用</div>
            </div>
            <Card className="mx-auto w-[400px]">
                <CardHeader className=" text-center">
                    <CardTitle className="text-xl">Welcome</CardTitle>
                    <CardDescription>
                        Sign up with your email and password
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSubmit)}>
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
            <div className=" absolute top-2 right-2 flex items-center gap-1">
                <ModeToggle />
                <LanguageToggle />
            </div>
        </div >
    )
}
