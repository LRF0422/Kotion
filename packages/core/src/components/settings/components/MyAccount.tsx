import { Separator } from "@kn/ui";
import { GlobalState } from "@kn/common";
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
        <div className="space-y-4">
            {/* Profile Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-sm">个人资料</CardTitle>
                            <CardDescription className="text-xs">管理您的公开个人信息</CardDescription>
                        </div>
                        <Button
                            variant={isEditing ? "default" : "outline"}
                            size="sm"
                            onClick={() => setIsEditing(!isEditing)}
                            className="h-7 text-xs"
                        >
                            {isEditing ? '保存更改' : '编辑资料'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Avatar Section */}
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <UserAvatar
                                userInfo={userInfo}
                                className="h-16 w-16 ring-2 ring-muted"
                            />
                            <button
                                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Camera className="h-5 w-5 text-white" />
                            </button>
                        </div>
                        <div className="flex-1 space-y-0.5">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-semibold">{userInfo?.name}</h3>
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Free</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">@{userInfo?.account}</p>
                            <p className="text-[10px] text-muted-foreground">点击头像更换图片</p>
                        </div>
                    </div>

                    <Separator className="my-3" />

                    {/* Profile Fields */}
                    <div className="grid gap-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-xs font-medium flex items-center gap-2">
                                    显示名称
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="job" className="text-xs font-medium flex items-center gap-1.5">
                                    <Briefcase className="h-3 w-3 text-muted-foreground" />
                                    职位
                                </Label>
                                <Input
                                    id="job"
                                    placeholder="例如：产品经理"
                                    value={formData.job}
                                    onChange={(e) => handleInputChange('job', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="organization" className="text-xs font-medium flex items-center gap-1.5">
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                    组织/公司
                                </Label>
                                <Input
                                    id="organization"
                                    placeholder="您的公司或组织"
                                    value={formData.organization}
                                    onChange={(e) => handleInputChange('organization', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="location" className="text-xs font-medium flex items-center gap-1.5">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    位置
                                </Label>
                                <Input
                                    id="location"
                                    placeholder="您的城市"
                                    value={formData.location}
                                    onChange={(e) => handleInputChange('location', e.target.value)}
                                    disabled={!isEditing}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Security Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-500/10">
                            <Shield className="h-3.5 w-3.5 text-blue-500" />
                        </div>
                        <div>
                            <CardTitle className="text-sm">账号安全</CardTitle>
                            <CardDescription className="text-xs">管理您的登录凭证和安全设置</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                    {/* Email */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-background">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <div>
                                <div className="text-xs font-medium">邮箱地址</div>
                                <div className="text-xs text-muted-foreground">{userInfo?.email || '未设置'}</div>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-xs">更改邮箱</Button>
                    </div>

                    {/* Password */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-background">
                                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <div>
                                <div className="text-xs font-medium">登录密码</div>
                                <div className="text-xs text-muted-foreground">上次修改: 从未修改</div>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-xs">更改密码</Button>
                    </div>

                    {/* Two-Factor Auth */}
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-background">
                                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <div>
                                <div className="text-xs font-medium">两步验证</div>
                                <div className="text-xs text-muted-foreground">为您的账号增加额外的安全保护</div>
                            </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">未启用</Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-destructive/10">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        </div>
                        <div>
                            <CardTitle className="text-sm text-destructive">危险区域</CardTitle>
                            <CardDescription className="text-xs">以下操作不可撤销，请谨慎操作</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-destructive/10">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </div>
                            <div>
                                <div className="text-xs font-medium text-destructive">删除账号</div>
                                <div className="text-xs text-muted-foreground">永久删除您的账号和所有关联数据</div>
                            </div>
                        </div>
                        <Button variant="destructive" size="sm" className="h-7 text-xs">删除账号</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}