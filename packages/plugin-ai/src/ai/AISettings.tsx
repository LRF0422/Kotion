import React from "react";
import { Label, Input, Button, Separator, Switch } from "@kn/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kn/ui";
import { Save, Key, Globe, Sparkles } from "@kn/icon";
import { useSafeState } from "ahooks";

interface AISettingsState {
    apiEndpoint: string;
    apiKey: string;
    imageApiEndpoint: string;
    enableAutoComplete: boolean;
    enableSuggestions: boolean;
    maxTokens: string;
}

export const AISettings: React.FC = () => {
    const [settings, setSettings] = useSafeState<AISettingsState>({
        apiEndpoint: '',
        apiKey: '',
        imageApiEndpoint: '',
        enableAutoComplete: true,
        enableSuggestions: true,
        maxTokens: '2048'
    });

    const [saved, setSaved] = useSafeState(false);

    const handleSave = () => {
        // In a real implementation, this would save to localStorage or backend
        console.log('Saving AI settings:', settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const updateSetting = <K extends keyof AISettingsState>(key: K, value: AISettingsState[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="space-y-6">
            {/* API Configuration Card */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <Globe className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                            <CardTitle className="text-base">API 配置</CardTitle>
                            <CardDescription>配置 AI 服务的 API 端点和密钥</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="apiEndpoint" className="text-sm font-medium">
                            文本生成 API 端点
                        </Label>
                        <Input
                            id="apiEndpoint"
                            placeholder="https://api.openai.com/v1/chat/completions"
                            value={settings.apiEndpoint}
                            onChange={(e) => updateSetting('apiEndpoint', e.target.value)}
                            className="h-9"
                        />
                        <p className="text-xs text-muted-foreground">
                            用于文本生成的 API 端点地址
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="imageApiEndpoint" className="text-sm font-medium">
                            图像生成 API 端点
                        </Label>
                        <Input
                            id="imageApiEndpoint"
                            placeholder="https://api.openai.com/v1/images/generations"
                            value={settings.imageApiEndpoint}
                            onChange={(e) => updateSetting('imageApiEndpoint', e.target.value)}
                            className="h-9"
                        />
                        <p className="text-xs text-muted-foreground">
                            用于图像生成的 API 端点地址
                        </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <Label htmlFor="apiKey" className="text-sm font-medium flex items-center gap-2">
                            <Key className="h-3.5 w-3.5" />
                            API 密钥
                        </Label>
                        <Input
                            id="apiKey"
                            type="password"
                            placeholder="sk-..."
                            value={settings.apiKey}
                            onChange={(e) => updateSetting('apiKey', e.target.value)}
                            className="h-9 font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                            您的 API 密钥将被安全存储
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Feature Settings Card */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                        </div>
                        <div>
                            <CardTitle className="text-base">功能设置</CardTitle>
                            <CardDescription>配置 AI 助手的行为和功能</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">自动补全</Label>
                            <p className="text-xs text-muted-foreground">
                                在输入时提供 AI 自动补全建议
                            </p>
                        </div>
                        <Switch
                            checked={settings.enableAutoComplete}
                            onCheckedChange={(checked) => updateSetting('enableAutoComplete', checked)}
                        />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">智能建议</Label>
                            <p className="text-xs text-muted-foreground">
                                根据上下文提供写作建议
                            </p>
                        </div>
                        <Switch
                            checked={settings.enableSuggestions}
                            onCheckedChange={(checked) => updateSetting('enableSuggestions', checked)}
                        />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <Label htmlFor="maxTokens" className="text-sm font-medium">
                            最大 Token 数量
                        </Label>
                        <Input
                            id="maxTokens"
                            type="number"
                            placeholder="2048"
                            value={settings.maxTokens}
                            onChange={(e) => updateSetting('maxTokens', e.target.value)}
                            className="h-9 w-32"
                        />
                        <p className="text-xs text-muted-foreground">
                            控制 AI 响应的最大长度
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button onClick={handleSave} className="gap-2">
                    <Save className="h-4 w-4" />
                    {saved ? '已保存' : '保存设置'}
                </Button>
            </div>
        </div>
    );
};
