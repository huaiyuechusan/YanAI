"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, LoaderCircle, Plus, RefreshCw, Search, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createAdminUser,
  deleteAdminUsers,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  updateAdminUserQuota,
  type AdminUser,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function UsersPageContent() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState({ email: "", password: "", name: "", quota: "0" });
  const [quotaInputs, setQuotaInputs] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeCount = useMemo(() => items.filter((item) => item.status === "active").length, [items]);
  const totalQuota = useMemo(() => items.reduce((sum, item) => sum + Number(item.quota || 0), 0), [items]);
  const selectedUsers = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return items.filter((item) => selectedSet.has(item.id));
  }, [items, selectedIds]);
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));
  const deleteCount = deleteTarget?.length ?? 0;
  const deleteDescription =
    deleteCount === 1
      ? `Delete user "${deleteTarget?.[0]?.name || deleteTarget?.[0]?.email}"? This user will no longer be able to sign in, and existing sessions will expire immediately.`
      : `Delete the selected ${deleteCount} users? They will no longer be able to sign in, and existing sessions will expire immediately.`;

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminUsers({ query });
      setItems(data.items);
      setSelectedIds((current) => current.filter((id) => data.items.some((item) => item.id === id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    try {
      const data = await createAdminUser({
        email: creating.email.trim(),
        password: creating.password,
        name: creating.name.trim(),
        quota: Number(creating.quota || 0),
      });
      setItems(data.items);
      setSelectedIds((current) => current.filter((id) => data.items.some((item) => item.id === id)));
      setCreating({ email: "", password: "", name: "", quota: "0" });
      toast.success("User created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create user");
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    try {
      const data = await updateAdminUser(user.id, { status: user.status === "active" ? "disabled" : "active" });
      setItems(data.items);
      setSelectedIds((current) => current.filter((id) => data.items.some((item) => item.id === id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    }
  };

  const handleSetQuota = async (user: AdminUser) => {
    try {
      const data = await updateAdminUserQuota(user.id, { amount: Number(quotaInputs[user.id] || 0), mode: "set" });
      setItems(data.items);
      setSelectedIds((current) => current.filter((id) => data.items.some((item) => item.id === id)));
      toast.success("Quota updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update quota");
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    try {
      const data = await resetAdminUserPassword(user.id);
      await navigator.clipboard.writeText(data.password);
      toast.success(`New password copied: ${data.password}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset password");
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds((current) => Array.from(new Set([...current, ...items.map((item) => item.id)])));
      return;
    }
    setSelectedIds([]);
  };

  const openDeleteUsers = (users: AdminUser[]) => {
    if (users.length === 0) {
      toast.error("Select users to delete first");
      return;
    }
    setDeleteTarget(users);
  };

  const handleDeleteUsers = async () => {
    if (!deleteTarget || deleteTarget.length === 0) return;
    setIsDeleting(true);
    try {
      const data = await deleteAdminUsers(deleteTarget.map((user) => user.id));
      setItems(data.items);
      setSelectedIds((current) => current.filter((id) => data.items.some((item) => item.id === id)));
      setDeleteTarget(null);
      toast.success(`Deleted ${data.removed} users`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-rose-400 uppercase">Users</div>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email or nickname" className="h-10 w-56 rounded-xl border-rose-100 bg-white" />
          <Button className="h-10 rounded-xl bg-rose-500 text-white hover:bg-rose-600" onClick={() => void load()}>
            <Search className="size-4" />
            Search
          </Button>
          <Button variant="outline" className="h-10 rounded-xl border-rose-100 bg-white" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Total Users", value: items.length },
          { label: "Active Users", value: activeCount },
          { label: "Remaining Quota", value: totalQuota },
        ].map((metric) => (
          <Card key={metric.label} className="rounded-lg border-white/80 bg-white/80 shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="text-sm text-stone-500">{metric.label}</div>
                <div className="mt-1 text-2xl font-semibold text-stone-950">{metric.value}</div>
              </div>
              <div className="rounded-2xl bg-rose-50 p-3 text-rose-500">
                <UserRound className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-lg border-white/80 bg-white/80 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <Plus className="size-4 text-rose-500" />
            Create Personal User
          </div>
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_120px_auto]">
            <Input value={creating.email} onChange={(event) => setCreating((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input value={creating.name} onChange={(event) => setCreating((current) => ({ ...current, name: event.target.value }))} placeholder="Nickname" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="password" value={creating.password} onChange={(event) => setCreating((current) => ({ ...current, password: event.target.value }))} placeholder="Initial Password" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="number" value={creating.quota} onChange={(event) => setCreating((current) => ({ ...current, quota: event.target.value }))} placeholder="Quota" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Button className="h-10 rounded-xl bg-rose-500 text-white hover:bg-rose-600" onClick={() => void handleCreate()}>
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-lg border-white/80 bg-white/80 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-rose-50 px-5 py-3">
            <Button
              variant="ghost"
              className="h-8 rounded-lg px-3 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
              onClick={() => openDeleteUsers(selectedUsers)}
              disabled={selectedUsers.length === 0 || isDeleting}
            >
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete Selected
            </Button>
            {selectedUsers.length > 0 ? (
              <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                Selected {selectedUsers.length} items
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-[44px_minmax(220px,1.4fr)_120px_120px_120px_150px_300px] border-b border-rose-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
              aria-label="Select all users"
            />
            <span>User</span>
            <span>Status</span>
            <span>Quota</span>
            <span>Images / Usage</span>
            <span>Last Login</span>
            <span>Actions</span>
          </div>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-rose-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-stone-500">No users yet</div>
          ) : (
            items.map((user) => (
              <div key={user.id} className="grid grid-cols-[44px_minmax(220px,1.4fr)_120px_120px_120px_150px_300px] items-center border-b border-rose-50 px-5 py-4 text-sm last:border-0">
                <Checkbox
                  checked={selectedIds.includes(user.id)}
                  onCheckedChange={(checked) => {
                    setSelectedIds((current) =>
                      checked
                        ? Array.from(new Set([...current, user.id]))
                        : current.filter((id) => id !== user.id),
                    );
                  }}
                  aria-label={`Select user ${user.email}`}
                />
                <div className="min-w-0">
                  <div className="truncate font-medium text-stone-900">{user.name}</div>
                  <div className="truncate text-xs text-stone-500">{user.email}</div>
                </div>
                <Badge variant={user.status === "active" ? "success" : "secondary"}>
                  {user.status === "active" ? "Active" : "Disable"}
                </Badge>
                <div className="font-semibold text-rose-600">{user.quota}</div>
                <div className="text-stone-600">{user.image_count || 0} / {user.spent_quota || user.quota_used || 0}</div>
                <div className="text-stone-500">{formatTime(user.last_login_at)}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    value={quotaInputs[user.id] ?? String(user.quota)}
                    onChange={(event) => setQuotaInputs((current) => ({ ...current, [user.id]: event.target.value }))}
                    className="h-8 w-20 rounded-lg border-rose-100 bg-white px-2"
                  />
                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-rose-100 bg-white" onClick={() => void handleSetQuota(user)}>
                    Change Quota
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-rose-100 bg-white" onClick={() => void handleToggleStatus(user)}>
                    {user.status === "active" ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-stone-500" onClick={() => void handleResetPassword(user)}>
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-rose-500 hover:bg-rose-50"
                    onClick={() => openDeleteUsers([user])}
                    aria-label="Delete User"
                    title="Delete User"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>{deleteCount === 1 ? "Delete User" : "Delete Users"}</DialogTitle>
            <DialogDescription>{deleteDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl border-stone-200 bg-white" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => void handleDeleteUsers()} disabled={isDeleting}>
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function UsersPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);

  if (isCheckingAuth || !session || session.role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-rose-400" />
      </div>
    );
  }

  return <UsersPageContent />;
}
