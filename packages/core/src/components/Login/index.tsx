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
        <div className="w-full lg:grid h-[100vh] lg:grid-cols-2 bg-background">
            {/* Theme Toggle */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
                <ModeToggle />
                <LanguageToggle />
            </div>

            {/* Left Side - Animated Background */}
            <div className="hidden lg:flex relative bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-900 dark:via-purple-900 dark:to-pink-900 overflow-hidden">
                {/* Animated gradient orbs */}
                <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 dark:bg-purple-700 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-72 h-72 bg-pink-300 dark:bg-pink-700 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-300 dark:bg-indigo-700 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

                {/* Grid pattern overlay */}
                <div className="absolute inset-0 bg-grid-pattern"></div>

                {/* Content with animation */}
                <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-12 text-white">
                    <div className="max-w-md space-y-8 animate-fade-in-up">
                        {/* Logo/Brand */}
                        <div className="space-y-4">
                            <div className="w-20 h-20 rounded-2xl bg-white/20 dark:bg-white/10 backdrop-blur-xl flex items-center justify-center text-4xl font-bold shadow-2xl animate-scale-in">
                                KN
                            </div>
                            <h2 className="text-5xl font-bold leading-tight">
                                Welcome to
                                <br />
                                <span className="text-white drop-shadow-lg">
                                    Knowledge
                                </span>
                            </h2>
                            <p className="text-lg text-white/90 dark:text-white/80 leading-relaxed drop-shadow-md">
                                Your intelligent workspace for capturing, organizing, and sharing knowledge seamlessly.
                            </p>
                        </div>

                        {/* Feature highlights with stagger animation */}
                        <div className="space-y-4 pt-8">
                            {[
                                { icon: '📝', title: '智能编辑器', desc: 'Powerful rich-text editor' },
                                { icon: '🔗', title: '团队协作', desc: 'Real-time collaboration' },
                                { icon: '🎨', title: '自定义主题', desc: 'Beautiful themes & plugins' },
                            ].map((feature, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-4 p-4 rounded-xl bg-white/15 dark:bg-white/10 backdrop-blur-sm hover:bg-white/25 dark:hover:bg-white/15 transition-all duration-300 animate-slide-in-left shadow-lg"
                                    style={{ animationDelay: `${index * 150}ms` }}
                                >
                                    <div className="text-3xl">{feature.icon}</div>
                                    <div>
                                        <div className="font-semibold text-white drop-shadow">{feature.title}</div>
                                        <div className="text-sm text-white/85 dark:text-white/75">{feature.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="flex items-center justify-center py-12 px-4 bg-white dark:bg-slate-950">
                <div className="mx-auto w-full max-w-[400px] space-y-6 animate-fade-in">
                    {/* Header */}
                    <div className="space-y-2 text-center lg:text-left">
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                            嗨，近来可好？
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            👋 欢迎来到 Knowledge, 登录以继续
                        </p>
                    </div>

                    {/* Form */}
                    <Form {...form}>
                        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                            <FormField
                                control={form.control}
                                name="account"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 dark:text-slate-200">账号</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="输入您的邮箱"
                                                className="h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-red-600 dark:text-red-400" />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center justify-between">
                                            <FormLabel className="text-slate-700 dark:text-slate-200">密码</FormLabel>
                                            <Link
                                                to="/forgot-password"
                                                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                            >
                                                忘记密码?
                                            </Link>
                                        </div>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                placeholder="输入您的密码"
                                                className="h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-all"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-red-600 dark:text-red-400" />
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-11 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:from-indigo-500 dark:to-purple-500 dark:hover:from-indigo-600 dark:hover:to-purple-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                登录
                            </Button>

                            {/* Divider */}
                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white dark:bg-slate-950 px-2 text-slate-500 dark:text-slate-400">
                                        或
                                    </span>
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                type="button"
                                className="w-full h-11 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 transition-all"
                            >
                                使用微信登录
                            </Button>

                            <div className="text-center text-sm text-slate-600 dark:text-slate-400">
                                还没有账号?{" "}
                                <Link to="/sign-up" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors">
                                    注册
                                </Link>
                            </div>
                        </form>
                    </Form>
                </div>
            </div>

            {/* Animation Styles */}
            <style>{`
                @keyframes blob {
                    0%, 100% {
                        transform: translate(0px, 0px) scale(1);
                    }
                    33% {
                        transform: translate(30px, -50px) scale(1.1);
                    }
                    66% {
                        transform: translate(-20px, 20px) scale(0.9);
                    }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
                @keyframes fade-in-up {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.8s ease-out;
                }
                @keyframes fade-in {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                .animate-fade-in {
                    animation: fade-in 0.6s ease-out;
                }
                @keyframes scale-in {
                    from {
                        opacity: 0;
                        transform: scale(0.8);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .animate-scale-in {
                    animation: scale-in 0.5s ease-out;
                }
                @keyframes slide-in-left {
                    from {
                        opacity: 0;
                        transform: translateX(-30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                .animate-slide-in-left {
                    animation: slide-in-left 0.6s ease-out backwards;
                }
                .bg-grid-pattern {
                    background-image: linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                                      linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
                    background-size: 50px 50px;
                }
            `}</style>
        </div>
    )
}

