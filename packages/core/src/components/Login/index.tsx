import { Button } from "@kn/ui"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@kn/ui"
import { Input } from "@kn/ui"
import { useForm } from "@kn/ui"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { z } from "@kn/ui"
import { zodResolver } from '@kn/ui';
import { useApi } from "@kn/common"
import { APIS } from "@kn/common"
import { clearContextSensitiveClientState, normalizeTokenResponse, notifyContextChanged, saveTokens } from "@kn/common"
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
    const [searchParams] = useSearchParams()
    const { t } = useTranslation()

    const formSchema = z.object({
        account: z.string().min(1, {
            message: 'account is required'
        }),
        password: z.string().min(1, {
            message: 'password is required'
        }),
        grantType: z.string().default('password'),
        audience: z.string().default('kotion-client'),
        type: z.string().default('account'),
        scope: z.string().default("all")
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema)
    })


    const onSubmit = (value: z.infer<typeof formSchema>) => {
        setLoading(true)
        const body = new URLSearchParams(Object.entries(value).map(([key, item]) => [key, String(item)]))
        useApi(APIS.LOGIN, undefined, body, { 'Content-Type': 'application/x-www-form-urlencoded' }).then(res => {

            const tokens = normalizeTokenResponse(res.data)
            if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Missing login tokens')
            clearContextSensitiveClientState()
            saveTokens(tokens.accessToken, tokens.refreshToken)
            notifyContextChanged("")
            localStorage.setItem("isLogin", "false")

            // Always enter the workspace. First-run onboarding is handled in-app by
            // TourHost (auto-starts the welcome tour for users who haven't seen it).
            setLoginSuccess(true)
            // Honor ?redirect=<relative path> so flows like invitation links can
            // resume where the user left off (only same-origin relative paths).
            const redirect = searchParams.get('redirect')
            const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
            // Small delay so the overlay paints before React starts unmounting Login
            setTimeout(() => navigate(target), 150)
        }).catch(e => {
            setLoading(false)
        })
    }



    return (
        <div className="w-full lg:grid h-screen lg:grid-cols-[1fr_460px] bg-background">
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

                {/* unDraw-style flat illustration — person working with a knowledge base */}
                <div className="hidden xl:block absolute right-6 top-1/2 -translate-y-1/2 z-0 w-[40%] max-w-[420px] pointer-events-none select-none animate-fade-in">
                    <svg viewBox="0 0 800.012 793.179" className="w-full h-auto" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        {/* Floating accent shapes (undraw composition style) */}
                        <circle cx="118" cy="150" r="15" fill="#6c63ff" />
                        <circle cx="704" cy="120" r="10" fill="#ed9da0" />
                        <circle cx="748" cy="540" r="7" fill="#6c63ff" />
                        <circle cx="92" cy="600" r="20" fill="none" stroke="#6c63ff" strokeWidth="4" />
                        <rect x="648" y="78" width="26" height="26" rx="5" transform="rotate(28 661 91)" fill="#c7c4ff" />
                        <rect x="150" y="688" width="22" height="22" rx="4" transform="rotate(-18 161 699)" fill="#ed9da0" />

                        {/* Illustration (unDraw — Katerina Limpitsouni, undraw.co) */}
                        <g transform="translate(-571.203 -218.417)">
                            <path d="M981.632,982.127H424.5V410.494c0-121.619,98.944-220.563,220.563-220.563H761.069c121.619,0,220.563,98.944,220.563,220.563Z" transform="translate(244.764 28.486)" fill="#f2f2f2" />
                            <path d="M865.627,982.125H424.5V410.492a218.856,218.856,0,0,1,42.122-129.658c1.013-1.381,2.024-2.744,3.066-4.092a220.511,220.511,0,0,1,46.943-45.564c1.007-.733,2.018-1.453,3.044-2.173a220.046,220.046,0,0,1,48.039-25.123c1.009-.382,2.036-.765,3.063-1.133a219.832,219.832,0,0,1,47.484-11.2c1-.137,2.035-.244,3.065-.352a223.293,223.293,0,0,1,47.479,0c1.028.107,2.059.215,3.074.353a219.788,219.788,0,0,1,47.471,11.2c1.027.367,2.055.75,3.066,1.134A219.5,219.5,0,0,1,769.9,228.635c1.025.7,2.051,1.424,3.062,2.144a222.832,222.832,0,0,1,28.06,23.757,220.263,220.263,0,0,1,19.423,22.21c1.039,1.344,2.049,2.707,3.061,4.086a218.858,218.858,0,0,1,42.124,129.66Z" transform="translate(244.764 28.488)" fill="#ccc" />
                            <circle cx="24.422" cy="24.422" r="24.422" transform="translate(1050.098 564.909)" fill="#6c63ff" />
                            <path d="M1064.222,710.828H266.783c-.71,0-1.286-.814-1.286-1.817s.576-1.818,1.286-1.818h797.439c.71,0,1.286.814,1.286,1.818S1064.933,710.828,1064.222,710.828Z" transform="translate(305.707 300.768)" fill="#e6e6e6" />
                            <path d="M705.852,759.927H507.422a9.869,9.869,0,0,1-9.922-9.792V307.223a9.869,9.869,0,0,1,9.921-9.792H705.852a9.869,9.869,0,0,1,9.921,9.792V750.135a9.869,9.869,0,0,1-9.922,9.792Z" transform="translate(283.19 85.073)" fill="#fff" />
                            <rect width="218.274" height="3.053" transform="translate(780.69 525.816)" fill="#ccc" />
                            <rect width="218.274" height="3.053" transform="translate(781.453 699.995)" fill="#ccc" />
                            <rect width="3.053" height="464.023" transform="translate(849.378 382.505)" fill="#ccc" />
                            <rect width="3.053" height="464.023" transform="translate(925.697 382.505)" fill="#ccc" />
                            <g transform="translate(1075.599 381.07)">
                                <path d="M532.06,220.925a23,23,0,0,1-.621,5.294l-17.588,74.846a19.759,19.759,0,0,1-23.787,14.714l-70.488-21.872-3.442-1.063a20.41,20.41,0,0,1-15.462,3.21c-10.231-1.81-17.314-10.136-15.82-18.609s11-13.862,21.23-12.062a20.45,20.45,0,0,1,13.441,8.294l.052.01.179.032,61.352,7.589,5.157-62.226a22.937,22.937,0,0,1,45.8,1.842Z" transform="translate(-384.654 -92.478)" fill="#ed9da0" />
                                <path d="M523.778,220.925a23,23,0,0,1-.621,5.294l-14.431,78a19.759,19.759,0,0,1-23.787,14.714l-70.488-19.6,3.158-30.523h0l53.679,7.368,6.694-57.1a22.937,22.937,0,0,1,45.8,1.842Z" transform="translate(-376.371 -92.478)" fill="#6c63ff" />
                                <rect width="21.152" height="21.152" transform="translate(221.929 552.023) rotate(-36.399)" fill="#ed9da0" />
                                <path d="M601.519,570.531l-36.191,26.681a25.93,25.93,0,0,1-10.5,4.579l-9.036,1.712a4.978,4.978,0,0,1-4.842-7.965l10.957-13.956,14.423-29.737.083.076c2.085,1.906,5.251,4.772,5.488,4.912,4.454.986,7.875.432,10.167-1.646,4-3.624,3.193-10.733,3.184-10.8l-.007-.055.047-.028a3.561,3.561,0,0,1,3.119-.427c2.082.76,3.168,3.492,3.324,3.911,2.032.285,7.318,6.345,7.743,6.836,3.041.551,5.135,1.693,6.223,3.393a6.917,6.917,0,0,1,.548,5.635A12.556,12.556,0,0,1,601.519,570.531Z" transform="translate(-341.504 3.596)" fill="#2f2e43" />
                                <rect width="21.152" height="21.152" transform="translate(71.799 589.151)" fill="#ed9da0" />
                                <path d="M469.188,615.868H424.225a25.933,25.933,0,0,1-11.168-2.545l-8.289-3.984a4.978,4.978,0,0,1,.829-9.284l17.1-4.732,29.255-15.377.022.111c.547,2.771,1.395,6.957,1.5,7.211,3,3.437,6.082,5.021,9.16,4.708,5.369-.544,8.938-6.744,8.974-6.807l.027-.048.055.006a3.561,3.561,0,0,1,2.764,1.507c1.225,1.847.478,4.691.355,5.12,1.467,1.435,2.125,9.45,2.176,10.1,2.121,2.248,3.129,4.409,3,6.424a6.918,6.918,0,0,1-2.9,4.861,12.557,12.557,0,0,1-7.893,2.733Z" transform="translate(-379.847 13.676)" fill="#2f2e43" />
                                <path d="M550.486,317.714H449.111L432.951,654.023h35.7l23.066-152.868,92.559,122.294,33.792-30.574-67.584-91.721Z" transform="translate(-371.229 -59.214)" fill="#2f2e43" />
                                <path d="M522.94,162.995a37.361,37.361,0,1,0-48.555,35.653l7.223,47.733,36.82-30.683s-7.954-10.131-12.22-21.556A37.321,37.321,0,0,0,522.94,162.995Z" transform="translate(-366.985 -112.605)" fill="#ed9da0" />
                                <path d="M524.276,281.639l16.557,48.79-93.675-1.053,13.967-44.58Z" transform="translate(-367.28 -69.241)" fill="#ed9da0" />
                                <path d="M518.46,184.739l-41.541,14.442L437.647,401.925l80.814,9.867h39.5l-30.18-201.615a67.286,67.286,0,0,0-9.323-25.438h0Z" transform="translate(-369.923 -96.176)" fill="#6c63ff" />
                                <path d="M497.342,378.487l.723-33.325-19.458-.422-.723,33.325a20.428,20.428,0,0,0-6.155,14.543c-.225,10.388,6.561,18.96,15.158,19.147s15.749-8.083,15.974-18.471a20.428,20.428,0,0,0-5.519-14.8Z" transform="translate(-360.452 -51.702)" fill="#ed9da0" />
                                <path d="M421.883,197.209c1.943.331,4.223-4.377,6.4-8.963,4.562-9.6,7.462-15.7,7.682-24.328.188-7.352-1.854-5.422-3.841-21.767-.655-5.391-9.865-5.381-11.74-7.941-3.166-4.324,1.692-6.107-6.186-8.7-14.756-4.865-21.428,2.693-30.8,3.344-.237.016-4.882,4.56-7.477,4.795-4.546.412-11.1-.3-14.043-7.222-2.749-6.476-4.57,12.448-2.113,14.789a49.753,49.753,0,0,1,5.776,7.342c.1.411-4.331-12.944-5.776-8.99-1.04,2.845-1.991,21.244.654,21.794,2.212.46,20.594,7.52,40.974-6.4.723-.494.04.294,2.561,6.4,3.179,7.7,3.9,8.121,3.841,10.243-.12,4.593-3.569,5.946-2.561,8.963a6.2,6.2,0,0,0,6.4,3.841c2.7-.558,3.165-3.9,5.122-3.841,1.676.051,3.664,2.575,3.841,5.122.373,5.366-7.571,6.842-8.963,14.085-.786,4.088,8.458-2.865,10.243-2.561Z" transform="translate(-274.113 -123.882)" fill="#090814" />
                            </g>
                        </g>
                    </svg>
                </div>

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

