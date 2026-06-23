import { Button } from "@kn/ui";
import { Empty } from "@kn/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Input } from "@kn/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { cn } from "@kn/ui";
import {
    Copy,
    Plus,
    Users,
    Link2,
    Search,
    MoreHorizontal,
    Shield,
    Mail,
    Settings,
    Crown,
    Check,
} from "@kn/icon";
import React from "react";
import { useSafeState } from "ahooks";
import { useTranslation } from "@kn/common";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import { toast } from "@kn/ui";
import { SettingsPanel, SettingsSection } from "./primitives";

interface MemberData {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    role: "owner" | "admin" | "member" | "guest";
    status: "active" | "pending";
    joinedAt: string;
}

// 演示用 mock 数据
const mockMembers: MemberData[] = [
    { id: "1", name: "张三", email: "zhangsan@example.com", role: "owner", status: "active", joinedAt: "2024-01-01" },
    { id: "2", name: "李四", email: "lisi@example.com", role: "admin", status: "active", joinedAt: "2024-02-15" },
    { id: "3", name: "王五", email: "wangwu@example.com", role: "member", status: "active", joinedAt: "2024-03-20" },
];

const mockGuests: MemberData[] = [
    { id: "4", name: "赵六", email: "zhaoliu@example.com", role: "guest", status: "pending", joinedAt: "2024-04-10" },
];

const RoleBadge: React.FC<{ role: MemberData["role"] }> = ({ role }) => {
    const { t } = useTranslation();
    const roleConfig = {
        owner: { label: t("settings.members.roleOwner"), icon: Crown },
        admin: { label: t("settings.members.roleAdmin"), icon: Shield },
        member: { label: t("settings.members.roleMember"), icon: Users },
        guest: { label: t("settings.members.roleGuest"), icon: Users },
    };
    const config = roleConfig[role];
    const Icon = config.icon;
    return (
        <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
            <Icon className="h-3 w-3" />
            {config.label}
        </Badge>
    );
};

const MemberItem: React.FC<{ member: MemberData }> = ({ member }) => {
    const { t } = useTranslation();
    return (
        <div className="group flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9">
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback className="bg-muted text-xs font-medium">{member.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{member.name}</span>
                        <RoleBadge role={member.role} />
                        {member.status === "pending" && (
                            <Badge variant="outline" className="border-amber-500/50 font-normal text-amber-600">
                                {t("settings.members.pending")}
                            </Badge>
                        )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                </div>
            </div>
            {member.role !== "owner" && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                            <Settings className="mr-2 h-4 w-4" />
                            {t("settings.members.editPermission")}
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Mail className="mr-2 h-4 w-4" />
                            {t("settings.members.sendMessage")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                            {t("settings.members.removeMember")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
};

export const Member: React.FC = () => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useSafeState("");
    const [copied, setCopied] = useSafeState(false);

    const handleCopyLink = () => {
        navigator.clipboard.writeText("https://kotion.app/invite/abc123");
        setCopied(true);
        toast.success(t("settings.members.linkCopied"));
        setTimeout(() => setCopied(false), 2000);
    };

    const filteredMembers = mockMembers.filter(
        (m) =>
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.email.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    const filteredGuests = mockGuests.filter(
        (m) =>
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.email.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    return (
        <SettingsPanel>
            {/* 邀请成员 */}
            <SettingsSection
                title={t("settings.members.inviteTitle")}
                description={t("settings.members.inviteDesc")}
                bare
            >
                <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                    {/* 邀请链接 */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex flex-1 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <code className="flex-1 truncate text-xs text-muted-foreground">
                                https://kotion.app/invite/abc123
                            </code>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                            {copied ? (
                                <>
                                    <Check className="h-4 w-4 text-green-600" /> {t("settings.members.copied")}
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4" /> {t("settings.members.copyLink")}
                                </>
                            )}
                        </Button>
                    </div>

                    {/* 邮件邀请 */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder={t("settings.members.emailPlaceholder")} className="h-9 pl-9" />
                        </div>
                        <Button size="sm" className="gap-2">
                            <Plus className="h-4 w-4" />
                            {t("settings.members.inviteBtn")}
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">{t("settings.members.permissionNote")}</p>
                </div>
            </SettingsSection>

            {/* 团队成员 */}
            <SettingsSection
                title={t("settings.members.teamTitle")}
                description={t("settings.members.teamDesc")}
                action={
                    <Badge variant="secondary" className="font-normal">
                        {t("settings.members.count", { n: mockMembers.length + mockGuests.length })}
                    </Badge>
                }
                bare
            >
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t("settings.members.search")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 pl-9"
                        />
                    </div>

                    <Tabs defaultValue="members">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="members" className="gap-1.5">
                                {t("settings.members.tabMembers")}
                                <span className="text-xs text-muted-foreground">{filteredMembers.length}</span>
                            </TabsTrigger>
                            <TabsTrigger value="groups">{t("settings.members.tabGroups")}</TabsTrigger>
                            <TabsTrigger value="guests" className="gap-1.5">
                                {t("settings.members.tabGuests")}
                                <span className="text-xs text-muted-foreground">{filteredGuests.length}</span>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="members" className="mt-3">
                            <MemberList
                                list={filteredMembers}
                                emptyTitle={t("settings.members.emptyMembers")}
                                emptyDesc={t("settings.members.emptyMembersDesc")}
                            />
                        </TabsContent>

                        <TabsContent value="groups" className="mt-3">
                            <div className="rounded-xl border border-border/60 bg-card py-8">
                                <Empty
                                    title={t("settings.members.emptyGroups")}
                                    desc={t("settings.members.emptyGroupsDesc")}
                                />
                                <div className="mt-4 flex justify-center">
                                    <Button variant="outline" size="sm" className="gap-2">
                                        <Plus className="h-4 w-4" />
                                        {t("settings.members.createGroup")}
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="guests" className="mt-3">
                            <MemberList
                                list={filteredGuests}
                                emptyTitle={t("settings.members.emptyGuests")}
                                emptyDesc={t("settings.members.emptyGuestsDesc")}
                            />
                        </TabsContent>
                    </Tabs>
                </div>
            </SettingsSection>
        </SettingsPanel>
    );
};

const MemberList: React.FC<{ list: MemberData[]; emptyTitle: string; emptyDesc: string }> = ({
    list,
    emptyTitle,
    emptyDesc,
}) => {
    if (list.length === 0) {
        return (
            <div className="rounded-xl border border-border/60 bg-card py-8">
                <Empty title={emptyTitle} desc={emptyDesc} />
            </div>
        );
    }
    return (
        <div className={cn("divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card")}>
            {list.map((member) => (
                <MemberItem key={member.id} member={member} />
            ))}
        </div>
    );
};
