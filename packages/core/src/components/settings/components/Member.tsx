import { Button } from "@kn/ui";
import { Empty } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Input } from "@kn/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import {
    Copy,
    Plus,
    Users,
    Link2,
    Search,
    MoreHorizontal,
    Shield,
    Mail,
    UserPlus,
    Settings,
    Crown,
    Check
} from "@kn/icon";
import React from "react";
import { useSafeState } from "ahooks";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import { toast } from "@kn/ui";

interface MemberData {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    role: 'owner' | 'admin' | 'member' | 'guest';
    status: 'active' | 'pending';
    joinedAt: string;
}

// Mock data for demonstration
const mockMembers: MemberData[] = [
    {
        id: '1',
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'owner',
        status: 'active',
        joinedAt: '2024-01-01'
    },
    {
        id: '2',
        name: '李四',
        email: 'lisi@example.com',
        role: 'admin',
        status: 'active',
        joinedAt: '2024-02-15'
    },
    {
        id: '3',
        name: '王五',
        email: 'wangwu@example.com',
        role: 'member',
        status: 'active',
        joinedAt: '2024-03-20'
    }
];

const mockGuests: MemberData[] = [
    {
        id: '4',
        name: '赵六',
        email: 'zhaoliu@example.com',
        role: 'guest',
        status: 'pending',
        joinedAt: '2024-04-10'
    }
];

const RoleBadge: React.FC<{ role: MemberData['role'] }> = ({ role }) => {
    const roleConfig = {
        owner: { label: '所有者', variant: 'default' as const, icon: Crown },
        admin: { label: '管理员', variant: 'secondary' as const, icon: Shield },
        member: { label: '成员', variant: 'outline' as const, icon: Users },
        guest: { label: '访客', variant: 'outline' as const, icon: Users }
    };
    const config = roleConfig[role];
    const Icon = config.icon;

    return (
        <Badge variant={config.variant} className="gap-1 text-xs">
            <Icon className="h-3 w-3" />
            {config.label}
        </Badge>
    );
};

const MemberItem: React.FC<{ member: MemberData }> = ({ member }) => (
    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group">
        <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
                <AvatarImage src={member.avatar} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {member.name.slice(0, 2)}
                </AvatarFallback>
            </Avatar>
            <div>
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{member.name}</span>
                    <RoleBadge role={member.role} />
                    {member.status === 'pending' && (
                        <Badge variant="outline" className="text-xs text-amber-500 border-amber-500">
                            待接受
                        </Badge>
                    )}
                </div>
                <div className="text-xs text-muted-foreground">{member.email}</div>
            </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {member.role !== 'owner' && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                            <Settings className="h-4 w-4 mr-2" />
                            编辑权限
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Mail className="h-4 w-4 mr-2" />
                            发送消息
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                            移除成员
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    </div>
);

export const Member: React.FC = () => {
    const [searchQuery, setSearchQuery] = useSafeState('');
    const [copied, setCopied] = useSafeState(false);

    const handleCopyLink = () => {
        navigator.clipboard.writeText('https://kotion.app/invite/abc123');
        setCopied(true);
        toast.success('邀请链接已复制');
        setTimeout(() => setCopied(false), 2000);
    };

    const filteredMembers = mockMembers.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredGuests = mockGuests.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Invite Card */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <UserPlus className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                            <CardTitle className="text-base">邀请成员</CardTitle>
                            <CardDescription>通过链接或邮件邀请新成员加入</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Invite Link */}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30">
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                            <code className="flex-1 text-sm text-muted-foreground truncate">
                                https://kotion.app/invite/abc123
                            </code>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyLink}
                            className="gap-2"
                        >
                            {copied ? (
                                <><Check className="h-4 w-4 text-green-500" /> 已复制</>
                            ) : (
                                <><Copy className="h-4 w-4" /> 复制链接</>
                            )}
                        </Button>
                    </div>

                    {/* Email Invite */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="输入邮箱地址邀请..."
                                className="pl-9 h-9"
                            />
                        </div>
                        <Button size="sm" className="gap-2">
                            <Plus className="h-4 w-4" />
                            邀请
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        只有拥有邀请成员权限的人员才能查看此内容
                    </p>
                </CardContent>
            </Card>

            {/* Members Card */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-green-500/10">
                                <Users className="h-4 w-4 text-green-500" />
                            </div>
                            <div>
                                <CardTitle className="text-base">团队成员</CardTitle>
                                <CardDescription>管理您的团队成员和权限</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                                {mockMembers.length + mockGuests.length} 人
                            </Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索成员..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9"
                        />
                    </div>

                    {/* Tabs */}
                    <Tabs defaultValue="members">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="members" className="gap-2">
                                <Users className="h-4 w-4" />
                                成员
                                <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
                                    {filteredMembers.length}
                                </Badge>
                            </TabsTrigger>
                            <TabsTrigger value="groups" className="gap-2">
                                <Shield className="h-4 w-4" />
                                群组
                            </TabsTrigger>
                            <TabsTrigger value="guests" className="gap-2">
                                <UserPlus className="h-4 w-4" />
                                访客
                                <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
                                    {filteredGuests.length}
                                </Badge>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="members" className="mt-4 space-y-1">
                            {filteredMembers.length > 0 ? (
                                filteredMembers.map(member => (
                                    <MemberItem key={member.id} member={member} />
                                ))
                            ) : (
                                <Empty
                                    title="没有找到成员"
                                    desc="尝试使用其他关键词搜索"
                                    className="py-8"
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="groups" className="mt-4">
                            <Empty
                                title="暂无群组"
                                desc="创建群组来组织您的团队成员"
                                className="py-8"
                            />
                            <div className="flex justify-center mt-4">
                                <Button variant="outline" size="sm" className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    创建群组
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="guests" className="mt-4 space-y-1">
                            {filteredGuests.length > 0 ? (
                                filteredGuests.map(guest => (
                                    <MemberItem key={guest.id} member={guest} />
                                ))
                            ) : (
                                <Empty
                                    title="暂无访客"
                                    desc="访客可以访问特定页面而无需完全成员身份"
                                    className="py-8"
                                />
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}