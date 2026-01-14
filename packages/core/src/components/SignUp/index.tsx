import { APIS } from "../../api"
import { Button } from "@kn/ui"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@kn/ui"
import { Input } from "@kn/ui"
import { useApi } from "../../hooks/use-api"
import { useNavigator } from "../../hooks/use-navigator"
import { ModeToggle } from "@kn/ui"
import { zodResolver } from "@kn/ui"
import { useForm } from "@kn/ui"
import { Link } from "react-router-dom"
import { z } from "@kn/ui"
import React, { useState } from "react"
import { LanguageToggle } from "../../locales/LanguageToggle"
import { Loader2 } from "@kn/icon"

export const description =
    "A sign up form with first name, last name, email and password inside a card. There's an option to sign up with GitHub and a link to login if you already have an account"

export function SignUpForm() {

    const navigator = useNavigator()
    const [loading, setLoading] = useState(false)

    const formSchema = z.object({
        avatar: z.string().default('upload/20241029/4d04038680ea9dce94495ad5c226e3c0.png'),
        account: z.string().min(1, {
            message: 'account is required'
        }),
        password: z.string().min(6, {
            message: 'password must be at least 6 characters'
        }),
        name: z.string().min(1, {
            message: 'name is required'
        })
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            avatar: 'upload/20241029/4d04038680ea9dce94495ad5c226e3c0.png',
            account: '',
            password: '',
            name: ''
        }
    })

    const handleSubmit = (values: z.infer<typeof formSchema>) => {
        setLoading(true)
        useApi(APIS.REGISTER, null, values).then((res) => {
            navigator.go({
                to: '/login'
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
            <div className="hidden lg:flex relative bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 dark:from-emerald-900 dark:via-teal-900 dark:to-cyan-900 overflow-hidden">
                {/* Animated gradient orbs */}
                <div className="absolute top-0 -left-4 w-72 h-72 bg-teal-300 dark:bg-teal-700 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-72 h-72 bg-cyan-300 dark:bg-cyan-700 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-emerald-300 dark:bg-emerald-700 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

                {/* Grid pattern overlay */}
                <div className="absolute inset-0 bg-grid-pattern"></div>

                {/* Content with animation */}
                <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-12 text-white">
                    <div className="max-w-md space-y-8 animate-fade-in-up">
                        {/* Logo/Brand */}
                        <div className="space-y-4">
                            <div className="w-20 h-20 rounded-2xl bg-white/20 dark:bg-white/10 backdrop-blur-xl flex items-center justify-center text-4xl font-bold shadow-2xl animate-scale-in">
                                K
                            </div>
                            <h2 className="text-5xl font-bold leading-tight">
                                Join us
                                <br />
                                <span className="text-white drop-shadow-lg">
                                    Knowledge
                                </span>
                            </h2>
                            <p className="text-lg text-white/90 dark:text-white/80 leading-relaxed drop-shadow-md">
                                Create your account and start your journey to organize knowledge efficiently.
                            </p>
                        </div>

                        {/* Feature highlights with stagger animation */}
                        <div className="space-y-4 pt-8">
                            {[
                                { icon: '✨', title: '快速开始', desc: 'Get started in seconds' },
                                { icon: '🔒', title: '安全可靠', desc: 'Your data is protected' },
                                { icon: '🚀', title: '持续更新', desc: 'Regular feature updates' },
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

            {/* Right Side - SignUp Form */}
            <div className="flex items-center justify-center py-12 px-4 bg-white dark:bg-slate-950">
                <div className="mx-auto w-full max-w-[400px] space-y-6 animate-fade-in">
                    {/* Header */}
                    <div className="space-y-2 text-center lg:text-left">
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                            Hi👋，欢迎使用
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            创建账号，开启您的知识管理之旅
                        </p>
                    </div>

                    {/* Form */}
                    <Form {...form}>
                        <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 dark:text-slate-200">昵称</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="输入您的昵称"
                                                className="h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-red-600 dark:text-red-400" />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="account"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-slate-700 dark:text-slate-200">账号</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="email"
                                                placeholder="输入您的邮箱"
                                                className="h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all"
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
                                        <FormLabel className="text-slate-700 dark:text-slate-200">密码</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                placeholder="设置您的密码（至少6位）"
                                                className="h-11 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all"
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
                                className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 dark:from-emerald-500 dark:to-teal-500 dark:hover:from-emerald-600 dark:hover:to-teal-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                新建账号
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
                                使用微信注册
                            </Button>

                            <div className="text-center text-sm text-slate-600 dark:text-slate-400">
                                已经拥有账号?{" "}
                                <Link to="/login" className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium transition-colors">
                                    登录
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
