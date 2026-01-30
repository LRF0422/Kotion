import { Separator } from "@kn/ui";
import { GlobalState } from "../../../store/GlobalState";
import React from "react";
import { useSelector } from "@kn/common";
import { UserAvatar } from "../../UserAvatar";
import { Input } from "@kn/ui";
import { Button } from "@kn/ui";
import { Label } from "@kn/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Camera, Mail, Lock, Shield, Trash2, MapPin, Briefcase, Building2, AlertTriangle } from "@kn/icon";
import { useSafeState } from "ahooks";

export const MyAccount: React.FC = () => {
    const { userInfo } = useSelector((state: GlobalState) => state);
    const [isEditing, setIsEditing] = useSafeState(false);
    const [formData, setFormData] = useSafeState({
        name: userInfo?.name || '',
        job: userInfo?.job || '',
        organization: userInfo?.organization || '',
        location: userInfo?.location || ''
    });

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="space-y-6">
            {/* Profile Card */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">个人资料</CardTitle>
                            <CardDescription>管理您的公开个人信息</CardDescription>
                        </div>
                        <Button
                            variant={isEditing ? "default" : "outline"}
                            size="sm"
                            onClick={() => setIsEditing(!isEditing)}
                        >
                            {isEditing ? '保存更改' : '编辑资料'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Avatar Section */}
                    <div className="flex items-center gap-6">
                        <div className="relative group">
                            <UserAvatar
                                userInfo={userInfo}
                                className="h-20 w-20 ring-4 ring-muted"
                            />
                            <button
                                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Camera className="h-6 w-6 text-white" />
                            </button>
                        </div>
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold">{userInfo?.name}</h3>
                                <Badge variant="secondary" className="text-xs">Free</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">@{userInfo?.account}</p>
                            <p className="text-xs text-muted-foreground">点击头像更换图片</p>
                        </div>
                    </div>

                    <Separator />

                    {/* Profile Fields */}
                    <div className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                                    显示名称
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="job" className="text-sm font-medium flex items-center gap-2">
                                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                                    职位
                                </Label>
                                <Input
                                    id="job"
                                    placeholder="例如：产品经理"
                                    value={formData.job}
                                    onChange={(e) => handleInputChange('job', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-9"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="organization" className="text-sm font-medium flex items-center gap-2">
                                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    组织/公司
                                </Label>
                                <Input
                                    id="organization"
                                    placeholder="您的公司或组织"
                                    value={formData.organization}
                                    onChange={(e) => handleInputChange('organization', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="location" className="text-sm font-medium flex items-center gap-2">
                                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                    位置
                                </Label>
                                <Input
                                    id="location"
                                    placeholder="您的城市"
                                    value={formData.location}
                                    onChange={(e) => handleInputChange('location', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-9"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Security Card */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <Shield className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                            <CardTitle className="text-base">账号安全</CardTitle>
                            <CardDescription>管理您的登录凭证和安全设置</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Email */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <div className="text-sm font-medium">邮箱地址</div>
                                <div className="text-sm text-muted-foreground">{userInfo?.email || '未设置'}</div>
                            </div>
                        </div>
                        <Button variant="outline" size="sm">更改邮箱</Button>
                    </div>

                    {/* Password */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background">
                                <Lock className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <div className="text-sm font-medium">登录密码</div>
                                <div className="text-sm text-muted-foreground">上次修改: 从未修改</div>
                            </div>
                        </div>
                        <Button variant="outline" size="sm">更改密码</Button>
                    </div>

                    {/* Two-Factor Auth */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <div className="text-sm font-medium">两步验证</div>
                                <div className="text-sm text-muted-foreground">为您的账号增加额外的安全保护</div>
                            </div>
                        </div>
                        <Badge variant="outline" className="text-xs">未启用</Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/50">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-destructive/10">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                            <CardTitle className="text-base text-destructive">危险区域</CardTitle>
                            <CardDescription>以下操作不可撤销，请谨慎操作</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-destructive/10">
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-destructive">删除账号</div>
                                <div className="text-sm text-muted-foreground">永久删除您的账号和所有关联数据</div>
                            </div>
                        </div>
                        <Button variant="destructive" size="sm">删除账号</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}