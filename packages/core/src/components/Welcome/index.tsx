import React, { useState } from 'react'
import { Button } from '@kn/ui'
import { ModeToggle, SparklesText } from '@kn/ui'
import { ArrowRight, BookOpen, Users, Zap, Sparkles, CheckCircle } from '@kn/icon'
import { LanguageToggle } from '../../locales/LanguageToggle'

export function Welcome() {
    const [currentStep, setCurrentStep] = useState(0)

    const features = [
        {
            icon: <BookOpen className="h-8 w-8" />,
            title: '知识管理',
            desc: '强大的文档编辑和组织能力，让知识触手可及',
            color: 'from-blue-500 to-cyan-500'
        },
        {
            icon: <Users className="h-8 w-8" />,
            title: '团队协作',
            desc: '实时协作编辑，让团队沟通更高效',
            color: 'from-purple-500 to-pink-500'
        },
        {
            icon: <Zap className="h-8 w-8" />,
            title: '插件扩展',
            desc: '丰富的插件生态，满足各种场景需求',
            color: 'from-orange-500 to-red-500'
        },
        {
            icon: <Sparkles className="h-8 w-8" />,
            title: 'AI 助手',
            desc: '智能 AI 助手，让创作更轻松',
            color: 'from-emerald-500 to-teal-500'
        }
    ]

    const steps = [
        {
            title: '欢迎来到 Knowledge',
            subtitle: '您的智能知识管理平台',
            content: (
                <div className="space-y-8">
                    <div className="text-center">
                        <SparklesText className="text-[80px]" sparklesCount={10} text="KN" />
                        <p className="mt-4 text-lg text-muted-foreground max-w-md mx-auto">
                            开启您的知识管理之旅，让想法更有条理，让协作更加高效
                        </p>
                    </div>
                </div>
            )
        },
        {
            title: '探索核心功能',
            subtitle: '了解 Knowledge 能为您做什么',
            content: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {features.map((feature, index) => (
                        <div
                            key={index}
                            className="group p-6 rounded-2xl border bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} text-white mb-4`}>
                                {feature.icon}
                            </div>
                            <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                            <p className="text-muted-foreground text-sm">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            )
        },
        {
            title: '准备就绪',
            subtitle: '现在开始您的知识之旅吧！',
            content: (
                <div className="text-center space-y-6">
                    <div className="inline-flex p-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white">
                        <CheckCircle className="h-16 w-16" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold">一切准备就绪!</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            您已经了解了 Knowledge 的核心功能，现在可以开始创建您的第一个空间了
                        </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 pt-4">
                        {['创建文档', '邀请成员', '安装插件'].map((item, index) => (
                            <div
                                key={index}
                                className="px-4 py-2 rounded-full bg-muted text-sm font-medium"
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            )
        }
    ]

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1)
        }
    }

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1)
        }
    }

    const handleComplete = () => {
        localStorage.setItem('hasCompletedWelcome', 'true')
        window.location.href = '/'
    }

    const handleSkip = () => {
        localStorage.setItem('hasCompletedWelcome', 'true')
        window.location.href = '/'
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
                <ModeToggle />
                <LanguageToggle />
            </div>

            {/* Progress bar */}
            <div className="w-full h-1 bg-muted">
                <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-4xl">
                    {/* Step Header */}
                    <div className="text-center mb-8 animate-fade-in">
                        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                            {steps[currentStep].title}
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                            {steps[currentStep].subtitle}
                        </p>
                    </div>

                    {/* Step Content */}
                    <div className="min-h-[400px] flex items-center justify-center animate-slide-in">
                        {steps[currentStep].content}
                    </div>

                    {/* Step Indicators */}
                    <div className="flex justify-center gap-2 mt-8">
                        {steps.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentStep(index)}
                                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${index === currentStep
                                        ? 'bg-primary w-8'
                                        : index < currentStep
                                            ? 'bg-primary/60'
                                            : 'bg-muted-foreground/30'
                                    }`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t bg-background/80 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Button
                        variant="ghost"
                        onClick={handleSkip}
                        className="text-muted-foreground"
                    >
                        跳过引导
                    </Button>

                    <div className="flex items-center gap-3">
                        {currentStep > 0 && (
                            <Button variant="outline" onClick={handlePrev}>
                                上一步
                            </Button>
                        )}
                        {currentStep < steps.length - 1 ? (
                            <Button
                                onClick={handleNext}
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                            >
                                下一步
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleComplete}
                                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                            >
                                开始使用
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Animation Styles */}
            <style>{`
                @keyframes fade-in {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out;
                }
                @keyframes slide-in {
                    from {
                        opacity: 0;
                        transform: translateX(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                .animate-slide-in {
                    animation: slide-in 0.5s ease-out;
                }
            `}</style>
        </div>
    )
}
