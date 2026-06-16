import { APIS } from "@kn/common"
import { Button } from "@kn/ui"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@kn/ui"
import { Input } from "@kn/ui"
import { useApi } from "@kn/common"
import { useNavigator } from "@kn/common"
import { useTranslation } from "@kn/common"
import { ModeToggle } from "@kn/ui"
import { zodResolver } from "@kn/ui"
import { useForm } from "@kn/ui"
import { Link } from "react-router-dom"
import { z } from "@kn/ui"
import React, { useState } from "react"
import { LanguageToggle } from "../../locales/LanguageToggle"
import { Loader2, Eye, EyeOff, Check, ArrowRight } from "@kn/icon"

export function SignUpForm() {

    const navigator = useNavigator()
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

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
        <div className="w-full lg:grid h-[100vh] lg:grid-cols-[1fr_460px] bg-background">
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
                        <pattern id="signup-dot-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <circle cx="1" cy="1" r="1" className="fill-foreground/20" />
                        </pattern>
                        <radialGradient id="signup-fade-center" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="white" stopOpacity="0" />
                            <stop offset="70%" stopColor="white" stopOpacity="1" />
                        </radialGradient>
                    </defs>
                    {/* Dot grid */}
                    <rect width="100%" height="100%" fill="url(#signup-dot-grid)" mask="url(#signup-grid-mask)" />
                    {/* Mask to fade grid towards center content area */}
                    <mask id="signup-grid-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <rect width="100%" height="100%" fill="url(#signup-fade-center)" />
                    </mask>
                </svg>

                {/* unDraw-style flat illustration — "all set" checklist (distinct from the login page) */}
                <div className="hidden xl:block absolute right-8 top-1/2 -translate-y-1/2 z-0 w-[38%] max-w-[370px] pointer-events-none select-none animate-fade-in">
                    <svg viewBox="0 0 443.57 607.17" className="w-full h-auto" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        {/* Floating accent shapes (different arrangement from login) */}
                        <circle cx="74" cy="92" r="22" fill="none" stroke="#6c63ff" strokeWidth="5" />
                        <circle cx="40" cy="188" r="11" fill="#6c63ff" />
                        <circle cx="146" cy="64" r="9" fill="#f3a3a6" />
                        <rect x="96" y="150" width="22" height="22" rx="4" transform="rotate(22 107 161)" fill="#c7c4ff" />
                        <circle cx="125" cy="220" r="5" fill="#6c63ff" />
                        <circle cx="416" cy="560" r="7" fill="#6c63ff" />

                        {/* Illustration (unDraw — Katerina Limpitsouni, undraw.co) */}
                        <path d="m392.63,606.19h-193.12c-28.09,0-50.94-22.85-50.94-50.94V50.94c0-28.09,22.85-50.94,50.94-50.94h193.12c28.09,0,50.94,22.85,50.94,50.94v504.31c0,28.09-22.85,50.94-50.94,50.94Z" fill="#dadbdc" strokeWidth="0" />
                        <path d="m392.77,592.4h-193.4c-20.79,0-37.71-16.92-37.71-37.71V50.51c0-20.79,16.92-37.71,37.71-37.71h193.4c20.79,0,37.71,16.92,37.71,37.71v504.18c0,20.79-16.92,37.71-37.71,37.71Z" fill="#fff" strokeWidth="0" />
                        <path d="m323.42,46.36h-54.69c-7.22,0-13.09-5.87-13.09-13.09s5.87-13.09,13.09-13.09h54.69c7.22,0,13.09,5.87,13.09,13.09s-5.87,13.09-13.09,13.09Z" fill="#dadbdc" strokeWidth="0" />
                        <path d="m379.23,200.32h-160.03c-3.17,0-5.75-3.28-5.75-7.3s2.58-7.3,5.75-7.3h160.03c3.17,0,5.75,3.28,5.75,7.3s-2.58,7.3-5.75,7.3Z" fill="#dadbdc" strokeWidth="0" />
                        <path d="m379.23,232.67h-160.03c-3.17,0-5.75-3.28-5.75-7.3s2.58-7.3,5.75-7.3h160.03c3.17,0,5.75,3.28,5.75,7.3s-2.58,7.3-5.75,7.3Z" fill="#dadbdc" strokeWidth="0" />
                        <path d="m333.34,265.02h-114.14c-3.17,0-5.75-3.28-5.75-7.3s2.58-7.3,5.75-7.3h114.14c3.17,0,5.75,3.28,5.75,7.3s-2.58,7.3-5.75,7.3Z" fill="#dadbdc" strokeWidth="0" />
                        <circle cx="296.07" cy="386.91" r="68.31" fill="#6c63ff" strokeWidth="0" />
                        <path d="m277.9,388.33c3.53,6.91,7.06,13.83,10.59,20.74,1.01,1.99,3.98,1.36,4.57-.6,4.63-15.44,13.23-29.51,24.82-40.7,2.32-2.24-1.22-5.77-3.54-3.54-12.2,11.78-21.23,26.67-26.11,42.91l4.57-.6c-3.53-6.91-7.06-13.83-10.59-20.74-1.46-2.87-5.78-.34-4.32,2.52h.01Z" fill="#fff" strokeWidth="0" />
                        <polygon points="111.92 304.28 95.36 309.93 95.1 286.02 110.17 285.85 111.92 304.28" fill="#f3a3a6" strokeWidth="0" />
                        <circle cx="97.04" cy="276.06" r="16.56" fill="#f3a3a6" strokeWidth="0" />
                        <path d="m101.57,274.37c-2.77-.05-4.62-2.83-5.73-5.38-1.11-2.54-2.25-5.47-4.82-6.5-2.11-.84-5.75,5.03-7.43,3.5-1.75-1.6-.15-9.94,1.67-11.45s4.33-1.83,6.69-1.97c5.77-.33,11.57.07,17.24,1.19,3.5.69,7.12,1.75,9.67,4.25,3.23,3.17,4.1,8,4.38,12.52.29,4.62.07,9.47-2.13,13.55-2.21,4.07-6.88,7.11-11.41,6.13-.48-2.45-.05-4.97.1-7.47.15-2.49-.07-5.18-1.61-7.15s-4.8-2.72-6.55-.94" fill="#2f2e43" strokeWidth="0" />
                        <path d="m122,279.88c1.64-1.23,3.61-2.27,5.65-2.04,2.21.24,4.09,2.04,4.68,4.18s-.02,4.51-1.36,6.28-3.35,2.95-5.49,3.55c-1.24.35-2.59.5-3.78,0-1.75-.73-2.71-2.94-2.05-4.72" fill="#2f2e43" strokeWidth="0" />
                        <path d="m60.38,436.33c-1.04,5.45,1.03,10.4,4.64,11.05,3.6.65,7.37-3.25,8.41-8.7.45-2.17.35-4.42-.29-6.55l12.74-85.41-17.16-3.03-5.65,86.63c-1.38,1.77-2.31,3.83-2.69,6.02h0Z" fill="#f3a3a6" strokeWidth="0" />
                        <path d="m95.06,298.96l-11.69.13c-8.25,1.34-10.45,5.78-12.23,13.94-2.73,12.45-6.21,29.04-5.48,29.27,1.17.38,21.17,9.52,31.29,7.26l-1.89-50.6Z" fill="#0f0f17" strokeWidth="0" />
                        <rect x="93.98" y="570.5" width="15.56" height="22.07" transform="translate(-6.49 1.17) rotate(-.64)" fill="#f3a3a6" strokeWidth="0" />
                        <path d="m79.06,606.19c-1.64.02-3.09,0-4.19-.09-4.14-.33-8.11-3.34-10.12-5.1-.9-.79-1.2-2.07-.75-3.17h0c.32-.79.98-1.39,1.8-1.64l10.89-3.24,17.55-12.13.2.35c.08.13,1.85,3.24,2.45,5.35.23.8.18,1.47-.15,1.99-.23.36-.55.57-.81.7.32.33,1.33,1,4.43,1.46,4.51.67,5.42-4.02,5.45-4.22l.03-.16.13-.09c2.13-1.41,3.44-2.05,3.9-1.92.29.08.76.22,2.18,12.94.13.4,1.06,3.32.48,6.13-.63,3.06-13.96,2.15-16.62,1.94-.08.01-10.04.83-16.87.9h.02Z" fill="#2f2e43" strokeWidth="0" />
                        <rect x="145.13" y="555" width="15.56" height="22.07" transform="translate(-280.8 171.48) rotate(-32.59)" fill="#f3a3a6" strokeWidth="0" />
                        <path d="m136.51,602.52c-1.83.02-3.51-.18-4.71-.38-1.18-.2-2.11-1.12-2.31-2.3h0c-.15-.85.1-1.7.66-2.34l7.52-8.51,8.47-19.58.36.19c.13.07,3.28,1.77,4.91,3.24.62.56.93,1.15.93,1.77,0,.43-.16.78-.32,1.02.45.11,1.66.14,4.53-1.11,4.18-1.82,2.47-6.28,2.39-6.46l-.06-.15.07-.14c1.06-2.32,1.84-3.56,2.29-3.7.29-.08.76-.22,8.7,9.82.32.27,2.66,2.25,3.65,4.94,1.08,2.93-10.7,9.21-13.08,10.44-.07.06-12.38,9.21-17.44,11.83-2.01,1.04-4.4,1.38-6.58,1.4l.02.02h0Z" fill="#2f2e43" strokeWidth="0" />
                        <path d="m118.79,385.68l-43.56.48-3.5,40.56,18.96,149.54,22.24-.25-9.85-86.38,36.94,77.68,19.61-14.06-28.98-72.58s9.36-63.61,1.28-79.34-13.13-15.67-13.13-15.67v.02h0Z" fill="#2f2e43" strokeWidth="0" />
                        <polygon points="140.48 387.91 71.3 388.68 91.06 299.01 121.21 298.67 140.48 387.91" fill="#0f0f17" strokeWidth="0" />
                        <path d="m147.24,435.37c1.16,5.43-.8,10.42-4.39,11.15-3.59.73-7.44-3.08-8.6-8.51-.5-2.16-.45-4.41.14-6.56l-14.64-85.11,17.09-3.41,7.57,86.49c1.42,1.74,2.39,3.78,2.83,5.96h0Z" fill="#f3a3a6" strokeWidth="0" />
                        <path d="m109.52,298.8l11.69-.13c8.28,1.16,10.57,5.55,12.54,13.67,3,12.39,6.85,28.89,6.13,29.14-1.17.4-20.95,9.98-31.12,7.95l.77-50.63h-.01Z" fill="#0f0f17" strokeWidth="0" />
                        <path d="m215.08,606.19c0,.54-.44.98-.98.98H.98c-.54,0-.98-.44-.98-.98s.44-.98.98-.98h213.12c.54,0,.98.44.98.98h0Z" fill="#3f3d58" strokeWidth="0" />
                    </svg>
                </div>

                <div className="relative z-10 flex flex-col justify-between w-full h-full p-12 xl:p-16 animate-fade-in-up">
                    {/* Center — Hero */}
                    <div className="flex-1 flex flex-col justify-center max-w-lg">
                        <h2 className="text-4xl xl:text-[44px] font-semibold leading-[1.2] tracking-tight text-foreground">
                            {t("auth.signup.heroLine1")}
                            <br />
                            {t("auth.signup.heroLine2")}
                        </h2>
                        <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-sm">
                            {t("auth.signup.heroSubtitle")}
                        </p>

                        {/* Feature list with checkmarks */}
                        <div className="mt-8 space-y-4">
                            {[
                                t("auth.signup.feature1"),
                                t("auth.signup.feature2"),
                                t("auth.signup.feature3"),
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

            {/* Right Side - SignUp Form */}
            <div className="flex items-center justify-center py-12 px-6 sm:px-8 bg-background border-l border-border">
                <div className="mx-auto w-full max-w-[340px] space-y-7 animate-fade-in">
                    {/* Mobile Logo (shown on small screens only) */}
                    <div className="lg:hidden text-center mb-6">
                        <h2 className="text-xl font-semibold tracking-tight">Knowledge</h2>
                    </div>

                    {/* Header */}
                    <div className="space-y-1.5">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            {t("auth.signup.title")}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t("auth.signup.subtitle")}
                        </p>
                    </div>

                    {/* Form */}
                    <Form {...form}>
                        <form className="space-y-5" onSubmit={form.handleSubmit(handleSubmit)}>
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-medium text-foreground">{t("auth.signup.name")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t("auth.signup.namePlaceholder")}
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
                                name="account"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-medium text-foreground">{t("auth.common.email")}</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="email"
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
                                        <FormLabel className="text-sm font-medium text-foreground">{t("auth.common.password")}</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    type={showPassword ? 'text' : 'password'}
                                                    placeholder={t("auth.signup.passwordPlaceholder")}
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
                                    <span>{t("auth.signup.submit")}</span>
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
                                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.653 3.75 4.84 7.093 5.088a9.536 9.536 0 0 0 2.354-.164l1.578.924a.271.271 0 0 0 .14.047c.133 0 .241-.112.241-.248 0-.06-.023-.12-.038-.178l-.326-1.233a.492.492 0 0 1 .177-.553C23.022 18.342 24 16.65 24 14.771c0-3.328-3.238-6.057-7.062-5.913zm-2.8 2.987c.534 0 .966.44.966.982a.974.974 0 0 1-.966.983.974.974 0 0 1-.966-.983c0-.542.433-.982.966-.982zm4.843 0c.534 0 .966.44.966.982a.974.974 0 0 1-.966.983.974.974 0 0 1-.966-.983c0-.542.433-.982.966-.982z" />
                                </svg>
                                {t("auth.signup.wechat")}
                            </Button>

                            <div className="text-center text-sm text-muted-foreground pt-1">
                                {t("auth.signup.haveAccount")}{' '}
                                <Link to="/login" className="text-primary font-medium hover:text-primary/80 transition-colors">
                                    {t("auth.signup.loginLink")}
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
