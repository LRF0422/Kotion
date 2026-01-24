import { APIS } from "../../api";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { Input } from "@kn/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { Tag, TagInput } from "@kn/ui";
import { useApi } from "@kn/core";
import { useSafeState } from "@kn/core";
import { useDebounce } from "@kn/core";
import { Check, Copy, Globe, Link2, Loader2, Mail, Search, Trash2, User, UserPlus, Users, X } from "@kn/icon";
import React, { PropsWithChildren, useCallback, useEffect, useState } from "react";
import { useParams } from "@kn/common";
import { toast } from "@kn/ui";
import { cn } from "@kn/ui";

// Types
interface CollaboratorUser {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    permission?: 'READ' | 'WRITE' | 'ADMIN';
}

interface CollaborationInvitationDlgProps extends PropsWithChildren {
    pageTitle?: string;
    onInviteSuccess?: () => void;
}

// Permission options
const PERMISSIONS = [
    { value: 'READ', label: 'Can view', description: 'Can only view the page' },
    { value: 'WRITE', label: 'Can edit', description: 'Can view and edit the page' },
    { value: 'ADMIN', label: 'Full access', description: 'Can manage collaborators' },
];

export const CollaborationInvitationDlg: React.FC<CollaborationInvitationDlgProps> = (props) => {
    const { pageTitle, onInviteSuccess } = props;
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('invite');

    // Search and user selection state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useSafeState<CollaboratorUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedUsers, setSelectedUsers] = useSafeState<CollaboratorUser[]>([]);
    const [selectedPermission, setSelectedPermission] = useState<string>('WRITE');

    // Email invitation state
    const [emails, setEmails] = useSafeState<Tag[]>([]);
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
    const [emailPermission, setEmailPermission] = useState<string>('WRITE');

    // Current collaborators state
    const [collaborators, setCollaborators] = useSafeState<CollaboratorUser[]>([]);
    const [loadingCollaborators, setLoadingCollaborators] = useState(false);

    // Share link state
    const [shareLink, setShareLink] = useState<string>('');
    const [isPublic, setIsPublic] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isGeneratingLink, setIsGeneratingLink] = useState(false);

    // Invitation loading state
    const [isInviting, setIsInviting] = useState(false);

    const params = useParams();
    const debouncedSearchQuery = useDebounce(searchQuery, {
        wait: 300,
    });

    // Search users when query changes
    useEffect(() => {
        if (debouncedSearchQuery.length >= 2) {
            searchUsers(debouncedSearchQuery);
        } else {
            setSearchResults([]);
        }
    }, [debouncedSearchQuery]);

    // Load collaborators when dialog opens
    useEffect(() => {
        if (open && activeTab === 'manage') {
            loadCollaborators();
        }
    }, [open, activeTab]);

    // Search users API call
    const searchUsers = async (query: string) => {
        setIsSearching(true);
        try {
            const res = await useApi(APIS.SEARCH_USERS, { keyword: query, pageSize: 10 });
            const users = (res.data?.records || res.data || []).map((user: any) => ({
                id: user.id,
                name: user.name || user.username || user.nickName,
                email: user.email,
                avatar: user.avatar || user.avatarUrl,
            }));
            setSearchResults(users);
        } catch (error) {
            console.error('Failed to search users:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Load current collaborators
    const loadCollaborators = async () => {
        setLoadingCollaborators(true);
        try {
            const res = await useApi(APIS.GET_PAGE_COLLABORATORS, { pageId: params.pageId });
            const users = (res.data || []).map((user: any) => ({
                id: user.id,
                name: user.name || user.username || user.nickName,
                email: user.email,
                avatar: user.avatar || user.avatarUrl,
                permission: user.permission || 'READ',
            }));
            setCollaborators(users);
        } catch (error) {
            console.error('Failed to load collaborators:', error);
        } finally {
            setLoadingCollaborators(false);
        }
    };

    // Toggle user selection
    const toggleUserSelection = useCallback((user: CollaboratorUser) => {
        setSelectedUsers(prev => {
            const isSelected = prev.some(u => u.id === user.id);
            if (isSelected) {
                return prev.filter(u => u.id !== user.id);
            } else {
                return [...prev, user];
            }
        });
    }, []);

    // Remove selected user
    const removeSelectedUser = useCallback((userId: string) => {
        setSelectedUsers(prev => prev.filter(u => u.id !== userId));
    }, []);

    // Handle user invitation
    const handleInviteUsers = async () => {
        if (selectedUsers.length === 0) {
            toast.error("Please select at least one user to invite");
            return;
        }

        setIsInviting(true);
        try {
            const param = {
                spaceId: params.id,
                pageId: params.pageId,
                collaboratorIds: selectedUsers.map(u => u.id),
                permissions: [selectedPermission]
            };
            await useApi(APIS.CREATE_INVITATION, null, param);
            toast.success(`Successfully invited ${selectedUsers.length} user(s)`);
            setSelectedUsers([]);
            setSearchQuery('');
            onInviteSuccess?.();
        } catch (error) {
            console.error('Failed to invite users:', error);
            toast.error("Failed to send invitation");
        } finally {
            setIsInviting(false);
        }
    };

    // Handle email invitation
    const handleInviteByEmail = async () => {
        if (emails.length === 0) {
            toast.error("Please enter at least one email address");
            return;
        }

        setIsInviting(true);
        try {
            const param = {
                spaceId: params.id,
                pageId: params.pageId,
                collaboratorEmails: emails.map(it => it.text),
                permissions: [emailPermission]
            };
            await useApi(APIS.CREATE_INVITATION, null, param);
            toast.success(`Invitation sent to ${emails.length} email(s)`);
            setEmails([]);
            onInviteSuccess?.();
        } catch (error) {
            console.error('Failed to send email invitation:', error);
            toast.error("Failed to send email invitation");
        } finally {
            setIsInviting(false);
        }
    };

    // Remove collaborator
    const handleRemoveCollaborator = async (userId: string) => {
        try {
            await useApi(APIS.REMOVE_PAGE_COLLABORATOR, { pageId: params.pageId, userId });
            setCollaborators(prev => prev.filter(c => c.id !== userId));
            toast.success("Collaborator removed");
        } catch (error) {
            console.error('Failed to remove collaborator:', error);
            toast.error("Failed to remove collaborator");
        }
    };

    // Update collaborator permission
    const handleUpdatePermission = async (userId: string, permission: string) => {
        try {
            await useApi(APIS.UPDATE_COLLABORATOR_PERMISSION, { pageId: params.pageId, userId }, { permission });
            setCollaborators(prev => prev.map(c => c.id === userId ? { ...c, permission: permission as 'READ' | 'WRITE' | 'ADMIN' } : c));
            toast.success("Permission updated");
        } catch (error) {
            console.error('Failed to update permission:', error);
            toast.error("Failed to update permission");
        }
    };

    // Generate share link
    const handleGenerateShareLink = async () => {
        setIsGeneratingLink(true);
        try {
            const res = await useApi(APIS.GENERATE_SHARE_LINK, { pageId: params.pageId }, { isPublic });
            const link = res.data?.link || `${window.location.origin}/share/${params.pageId}`;
            setShareLink(link);
        } catch (error) {
            console.error('Failed to generate share link:', error);
            // Fallback to generated link
            setShareLink(`${window.location.origin}/share/${params.pageId}`);
        } finally {
            setIsGeneratingLink(false);
        }
    };

    // Copy share link
    const handleCopyLink = async () => {
        const linkToCopy = shareLink || `${window.location.origin}/space-detail/${params.id}/page/${params.pageId}`;
        try {
            await navigator.clipboard.writeText(linkToCopy);
            setLinkCopied(true);
            toast.success("Link copied to clipboard");
            setTimeout(() => setLinkCopied(false), 2000);
        } catch (error) {
            toast.error("Failed to copy link");
        }
    };

    // Get user initials
    const getUserInitials = (name: string) => {
        return name?.charAt(0)?.toUpperCase() || '?';
    };

    // Get permission label
    const getPermissionLabel = (permission: string) => {
        return PERMISSIONS.find(p => p.value === permission)?.label || permission;
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{props.children}</DialogTrigger>
            <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Invite to Edit
                    </DialogTitle>
                    <DialogDescription>
                        {pageTitle ? `Share "${pageTitle}" with others` : 'Invite people to collaborate on this page'}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="invite" className="gap-1">
                            <User className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Invite</span>
                        </TabsTrigger>
                        <TabsTrigger value="email" className="gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Email</span>
                        </TabsTrigger>
                        <TabsTrigger value="manage" className="gap-1">
                            <Users className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Manage</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* Invite Users Tab */}
                    <TabsContent value="invite" className="space-y-4 mt-4">
                        {/* Selected Users */}
                        {selectedUsers.length > 0 && (
                            <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                                {selectedUsers.map(user => (
                                    <Badge key={user.id} variant="secondary" className="flex items-center gap-1.5 pr-1">
                                        <Avatar className="h-5 w-5">
                                            <AvatarImage src={user.avatar} />
                                            <AvatarFallback className="text-xs">{getUserInitials(user.name)}</AvatarFallback>
                                        </Avatar>
                                        <span className="max-w-[100px] truncate">{user.name}</span>
                                        <button
                                            onClick={() => removeSelectedUser(user.id)}
                                            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}

                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                            {isSearching && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                        </div>

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                                {searchResults.map(user => {
                                    const isSelected = selectedUsers.some(u => u.id === user.id);
                                    return (
                                        <div
                                            key={user.id}
                                            onClick={() => toggleUserSelection(user)}
                                            className={cn(
                                                "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                                "hover:bg-muted/50 border-b last:border-b-0",
                                                isSelected && "bg-primary/5"
                                            )}
                                        >
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback>{getUserInitials(user.name)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{user.name}</div>
                                                {user.email && (
                                                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* No Results */}
                        {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                            <div className="text-center py-6 text-muted-foreground">
                                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No users found</p>
                            </div>
                        )}

                        {/* Permission Selection and Invite Button */}
                        <div className="flex items-center gap-2 pt-2">
                            <Select value={selectedPermission} onValueChange={setSelectedPermission}>
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PERMISSIONS.map(perm => (
                                        <SelectItem key={perm.value} value={perm.value}>
                                            <div className="flex flex-col">
                                                <span>{perm.label}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={handleInviteUsers}
                                disabled={selectedUsers.length === 0 || isInviting}
                                className="flex-1"
                            >
                                {isInviting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Invite {selectedUsers.length > 0 ? `(${selectedUsers.length})` : ''}
                                    </>
                                )}
                            </Button>
                        </div>
                    </TabsContent>

                    {/* Email Invitation Tab */}
                    <TabsContent value="email" className="space-y-4 mt-4">
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Email Addresses</label>
                                <TagInput
                                    tags={emails}
                                    setTags={(newValues) => setEmails(newValues)}
                                    activeTagIndex={activeTagIndex}
                                    setActiveTagIndex={setActiveTagIndex}
                                    placeholder="Enter email addresses..."
                                    styleClasses={{
                                        input: 'min-h-[80px]',
                                    }}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Press Enter or comma to add each email
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Select value={emailPermission} onValueChange={setEmailPermission}>
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PERMISSIONS.map(perm => (
                                            <SelectItem key={perm.value} value={perm.value}>
                                                {perm.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={handleInviteByEmail}
                                    disabled={emails.length === 0 || isInviting}
                                    className="flex-1"
                                >
                                    {isInviting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Mail className="h-4 w-4 mr-2" />
                                            Send Invitation
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Manage Collaborators Tab */}
                    <TabsContent value="manage" className="space-y-4 mt-4">
                        {loadingCollaborators ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : collaborators.length > 0 ? (
                            <div className="space-y-2">
                                {collaborators.map(collaborator => (
                                    <div
                                        key={collaborator.id}
                                        className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                                    >
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={collaborator.avatar} />
                                            <AvatarFallback>{getUserInitials(collaborator.name)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{collaborator.name}</div>
                                            {collaborator.email && (
                                                <div className="text-xs text-muted-foreground truncate">{collaborator.email}</div>
                                            )}
                                        </div>
                                        <Select
                                            value={collaborator.permission || 'READ'}
                                            onValueChange={(value) => handleUpdatePermission(collaborator.id, value)}
                                        >
                                            <SelectTrigger className="w-[120px] h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PERMISSIONS.map(perm => (
                                                    <SelectItem key={perm.value} value={perm.value}>
                                                        {perm.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleRemoveCollaborator(collaborator.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">No collaborators yet</p>
                                <p className="text-sm">Invite people to start collaborating</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                {/* Share Link Section */}
                <Separator className="my-4" />
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Share Link</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                            <Globe className="h-3 w-3 mr-1" />
                            {isPublic ? 'Public' : 'Private'}
                        </Badge>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            readOnly
                            value={shareLink || `${window.location.origin}/space-detail/${params.id}/page/${params.pageId}`}
                            className="text-sm bg-muted/50"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopyLink}
                            className="flex-shrink-0"
                        >
                            {linkCopied ? (
                                <Check className="h-4 w-4 text-green-500" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}