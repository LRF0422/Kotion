import { Button } from "@kn/ui"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@kn/ui"
import { Input } from "@kn/ui"
import { useForm } from "@kn/ui"
import { Link, useNavigate } from "react-router-dom"
import { z } from "@kn/ui"
import { zodResolver } from '@kn/ui';
import { useApi } from "@kn/common"
import { APIS } from "@kn/common"
import { saveTokens } from "@kn/common"
import { useTranslation } from "@kn/common"
import { useState } from "react"
import { Loader2, Eye, EyeOff, Check, ArrowRight } from "@kn/icon"
import { ModeToggle } from "@kn/ui"
import React from "react"
import { LanguageToggle } from "../../locales/LanguageToggle"
import { SparklesText } from "@kn/ui"


export function Login() {

    const [loading, setLoading] = useState(false)
    const [loginSuccess, setLoginSuccess] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const navigate = useNavigate()
    const { t } = useTranslation()

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
            saveTokens(data.access_token, data.refresh_token)
            localStorage.setItem("isLogin", "false")

            // Check if this is first login (no welcome completed)
            const hasCompletedWelcome = localStorage.getItem('hasCompletedWelcome')
            if (!hasCompletedWelcome) {
                // First time user, redirect to welcome page
                navigate('/welcome')
            } else {
                // Returning user — show transition overlay, then navigate without full reload
                setLoginSuccess(true)
                // Small delay so the overlay paints before React starts unmounting Login
                setTimeout(() => navigate('/'), 150)
            }
        }).catch(e => {
            setLoading(false)
        })
    }



    return (
        <div className="w-full lg:grid h-[100vh] lg:grid-cols-[1fr_460px] bg-background">
            {/* Login success transition overlay */}
            {loginSuccess && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
                    <div className="flex flex-col items-center gap-4">
                        <SparklesText className="text-[60px]" sparklesCount={8} text="KN" />
                        <div className="flex items-center gap-2 text-lg text-muted-foreground">
                            <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Theme & Language Toggle */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
                <ModeToggle />
                <LanguageToggle />
            </div>

            {/* Left Side - Brand Panel (Notion-style) */}
            <div className="hidden lg:flex relative overflow-hidden bg-muted/30 dark:bg-muted/10 border-r border-border">
                {/* Decorative background — dot grid + soft radial accents */}
                <svg className="absolute inset-0 w-full h-full opacity-[0.4] dark:opacity-[0.2]" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <defs>
                        <pattern id="login-dot-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <circle cx="1" cy="1" r="1" className="fill-foreground/20" />
                        </pattern>
                        <radialGradient id="login-fade-center" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="white" stopOpacity="0" />
                            <stop offset="70%" stopColor="white" stopOpacity="1" />
                        </radialGradient>
                    </defs>
                    {/* Dot grid */}
                    <rect width="100%" height="100%" fill="url(#login-dot-grid)" mask="url(#login-grid-mask)" />
                    {/* Mask to fade grid towards center content area */}
                    <mask id="login-grid-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <rect width="100%" height="100%" fill="url(#login-fade-center)" />
                    </mask>
                </svg>

                <div className="relative z-10 flex flex-col justify-between w-full h-full p-12 xl:p-16 animate-fade-in-up">
                    {/* Center — Hero (no logo per request) */}
                    <div className="flex-1 flex flex-col justify-center max-w-lg">
                        <h2 className="text-4xl xl:text-[44px] font-semibold leading-[1.2] tracking-tight text-foreground">
                            {t("auth.login.heroLine1")}
                            <br />
                            {t("auth.login.heroLine2")}
                        </h2>
                        <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-sm">
                            {t("auth.login.heroSubtitle")}
                        </p>

                        {/* Feature list with checkmarks */}
                        <div className="mt-8 space-y-4">
                            {[
                                t("auth.login.feature1"),
                                t("auth.login.feature2"),
                                t("auth.login.feature3"),
                            ].map((text, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-3 animate-slide-in-left"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                                        <Check className="h-3 w-3" strokeWidth={3} />
                                    </div>
                                    <span className="text-sm text-foreground/80">{text}</span>
                                </div>
                            ))}
                        </div>

                        {/* Mock UI illustration */}
                        <div className="mt-10 rounded-lg border border-border/60 bg-background/50 p-4 animate-fade-in">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-3 w-3 rounded-full bg-red-400/60" />
                                <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
                                <div className="h-3 w-3 rounded-full bg-green-400/60" />
                                <span className="ml-2 text-[11px] text-muted-foreground/50 font-mono">Knowledge</span>
                            </div>
                            <div className="space-y-2.5">
                                <div className="h-2.5 w-3/4 rounded bg-foreground/8" />
                                <div className="h-2 w-full rounded bg-foreground/5" />
                                <div className="h-2 w-full rounded bg-foreground/5" />
                                <div className="h-2 w-2/3 rounded bg-foreground/5" />
                                <div className="mt-4 h-2.5 w-1/2 rounded bg-foreground/8" />
                                <div className="h-2 w-full rounded bg-foreground/5" />
                                <div className="h-2 w-5/6 rounded bg-foreground/5" />
                            </div>
                            <div className="mt-4 flex gap-2">
                                <div className="h-7 w-16 rounded-md bg-foreground/6" />
                                <div className="h-7 w-16 rounded-md bg-foreground/6" />
                            </div>
                        </div>
                    </div>

                    {/* Bottom — Footer */}
                    <p className="text-xs text-muted-foreground/50">
                        © {new Date().getFullYear()} Knowledge Repo
                    </p>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="flex items-center justify-center py-12 px-6 sm:px-8 bg-background border-l border-border">
                <div className="mx-auto w-full max-w-[340px] space-y-7 animate-fade-in">
                    {/* Mobile Logo (shown on small screens only) */}
                    <div className="lg:hidden text-center mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Knowledge</h2>
                    </div>

                    {/* Header */}
                    <div className="space-y-1.5">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            {t("auth.login.title")}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t("auth.login.subtitle")}
                        </p>
                    </div>

                    {/* Form */}
                    <Form {...form}>
                        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
                            <FormField
                                control={form.control}
                                name="account"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-medium text-foreground">{t("auth.common.email")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t("auth.common.emailPlaceholder")}
                                                className="h-10 bg-background border-border focus-visible:ring-1 focus-visible:ring-primary/30 transition-all"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center justify-between">
                                            <FormLabel className="text-sm font-medium text-foreground">{t("auth.common.password")}</FormLabel>
                                            <Link
                                                to="/forgot-password"
                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                {t("auth.login.forgotPassword")}
                                            </Link>
                                        </div>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    type={showPassword ? 'text' : 'password'}
                                                    placeholder={t("auth.login.passwordPlaceholder")}
                                                    className="h-10 bg-background border-border pr-10 focus-visible:ring-1 focus-visible:ring-primary/30 transition-all"
                                                    {...field}
                                                />
                                                <button
                                                    type="button"
                                                    tabIndex={-1}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                >
                                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-10 font-medium transition-colors"
                            >
                                {loading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <span>{t("auth.login.submit")}</span>
                                )}
                                {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
                            </Button>

                            {/* Divider */}
                            <div className="relative my-3">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-border"></div>
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="bg-background px-3 text-muted-foreground">
                                        {t("auth.common.orContinueWith")}
                                    </span>
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                type="button"
                                className="w-full h-10 border-border hover:bg-muted transition-colors"
                            >
                                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.653 3.75 4.84 7.093 5.088a9.536 9.536 0 0 0 2.354-.164l1.578.924a.271.271 0 0 0 .14.047c.133 0 .241-.112.241-.248 0-.06-.023-.12-.038-.178l-.326-1.233a.492.492 0 0 1 .177-.553C23.022 18.342 24 16.65 24 14.771c0-3.328-3.238-6.057-7.062-5.913zm-2.8 2.987c.534 0 .966.44.966.982a.974.974 0 0 1-.966.983.974.974 0 0 1-.966-.983c0-.542.433-.982.966-.982zm4.843 0c.534 0 .966.44.966.982a.974.974 0 0 1-.966.983.974.974 0 0 1-.966-.983c0-.542.433-.982.966-.982z"/>
                                </svg>
                                {t("auth.login.wechat")}
                            </Button>

                            <div className="text-center text-sm text-muted-foreground pt-1">
                                {t("auth.login.noAccount")}{' '}
                                <Link to="/sign-up" className="text-primary font-medium hover:text-primary/80 transition-colors">
                                    {t("auth.login.signUpLink")}
                                </Link>
                            </div>
                        </form>
                    </Form>
                </div>
            </div>

            {/* Animation Styles */}
            <style>{`
                @keyframes fade-in-up {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.6s ease-out;
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
                    animation: fade-in 0.5s ease-out;
                }
                @keyframes slide-in-left {
                    from {
                        opacity: 0;
                        transform: translateX(-16px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                .animate-slide-in-left {
                    animation: slide-in-left 0.5s ease-out backwards;
                }
            `}</style>
        </div>
    )
}

