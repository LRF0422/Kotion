import { Button, Alert, AlertTitle, AlertDescription } from "@kn/ui";
import { useNavigator } from "../hooks/use-navigator";
import React, { useState, useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { useTranslation } from "@kn/common";

interface ErrorPageProps {
    error?: Error;
    resetError?: () => void;
}

export const ErrorPage: React.FC<ErrorPageProps> = ({ error: propsError, resetError }) => {
    const navigator = useNavigator();
    const routeError = useRouteError() as Error | null;
    const error = propsError || routeError;
    const [showDetails, setShowDetails] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        // Log error for debugging
        if (error) {
            console.error("ErrorPage caught:", error);
        }
    }, [error]);

    const handleGoHome = () => {
        if (resetError) {
            resetError();
        }
        navigator.go({
            to: '/home'
        });
    };

    const handleReload = () => {
        window.location.reload();
    };

    return (
        <div className="w-screen h-screen flex justify-center items-center bg-background p-4">
            <div className="flex flex-col gap-6 items-center max-w-2xl w-full">
                {/* Error Icon Animation */}
                <div className="relative">
                    <div className="absolute inset-0 bg-destructive/20 rounded-full blur-2xl animate-pulse"></div>
                    <div className="relative bg-destructive/10 rounded-full p-6 border-2 border-destructive/30">
                        <svg
                            className="w-16 h-16 text-destructive"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                </div>

                {/* Error Title */}
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-foreground">
                        {t("errorPage.title")}
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        {t("errorPage.subtitle")}
                    </p>
                </div>

                {/* Error Alert */}
                {error && (
                    <Alert variant="destructive" className="w-full">
                        <AlertTitle>{t("errorPage.errorDetails")}</AlertTitle>
                        <AlertDescription className="space-y-2">
                            <p className="font-mono text-sm">{error.message || t("errorPage.unknownError")}</p>
                            {error.stack && (
                                <div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowDetails(!showDetails)}
                                        className="px-0 h-auto font-normal text-xs hover:bg-transparent"
                                    >
                                        {showDetails ? t("errorPage.hideDetails") : t("errorPage.showDetails")}
                                    </Button>
                                    {showDetails && (
                                        <pre className="mt-2 p-3 bg-background/50 rounded text-xs overflow-auto max-h-40 border">
                                            {error.stack}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <Button
                        size="lg"
                        onClick={handleGoHome}
                        className="min-w-[160px]"
                    >
                        <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                            />
                        </svg>
                        {t("errorPage.backToHome")}
                    </Button>
                    <Button
                        size="lg"
                        variant="outline"
                        onClick={handleReload}
                        className="min-w-[160px]"
                    >
                        <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        {t("errorPage.reloadPage")}
                    </Button>
                </div>

                {/* Help Text */}
                <div className="text-center text-sm text-muted-foreground space-y-1">
                    <p>{t("errorPage.helpTitle")}</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>{t("errorPage.helpClearCache")}</li>
                        <li>{t("errorPage.helpCheckConnection")}</li>
                        <li>{t("errorPage.helpContactSupport")}</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};