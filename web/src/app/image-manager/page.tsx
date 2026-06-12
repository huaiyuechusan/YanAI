"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Copy,
  ImageIcon,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { DateRangeFilter } from "@/components/date-range-filter";
import { ImageLightbox } from "@/components/image-lightbox";
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
import { WebDAVSettingsDialog } from "@/components/webdav-settings-dialog";
import {
  deleteManagedImages,
  fetchImagesWebDAVConfig,
  fetchManagedImages,
  syncImagesToWebDAV,
  updateImagesWebDAVConfig,
  type ImageWebDAVConfig,
  type ImageWebDAVConfigPayload,
  type ManagedImage,
  type ManagedImageDeleteTarget,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

function formatSize(size: number) {
  if (!size) return "-";
  return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(size / 1024)} KB`;
}

function imageKey(item: ManagedImage | ManagedImageDeleteTarget) {
  return item.record_id || item.id || item.url;
}

function imageDate(item: ManagedImage) {
  return item.date || item.created_at.slice(0, 10) || "Unknown Date";
}

function toDeleteTarget(item: ManagedImage): ManagedImageDeleteTarget {
  return {
    id: item.id,
    record_id: item.record_id,
    url: item.url,
  };
}

function ImageManagerContent() {
  const [items, setItems] = useState<ManagedImage[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [userId, setUserId] = useState("");
  const [channel, setChannel] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dimensions, setDimensions] = useState<Record<string, string>>({});
  const [selectedItems, setSelectedItems] = useState<Record<string, ManagedImageDeleteTarget>>({});
  const [deleteTarget, setDeleteTarget] = useState<ManagedImageDeleteTarget[] | null>(null);
  const [webdavConfig, setWebdavConfig] = useState<ImageWebDAVConfig | null>(null);
  const [webdavOpen, setWebdavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingWebDAV, setIsSavingWebDAV] = useState(false);
  const [isSyncingWebDAV, setIsSyncingWebDAV] = useState(false);
  const pageSize = 12;

  const lightboxImages = items.map((item) => ({
    id: item.name,
    src: item.url,
    sizeLabel: formatSize(item.size),
    dimensions: dimensions[item.url],
  }));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const selectedTargets = useMemo(() => Object.values(selectedItems), [selectedItems]);
  const selectedCount = selectedTargets.length;
  const allCurrentSelected = items.length > 0 && items.every((item) => selectedItems[imageKey(item)]);
  const someCurrentSelected = items.some((item) => selectedItems[imageKey(item)]);
  const dateGroups = useMemo(() => {
    const groups = new Map<string, ManagedImage[]>();
    items.forEach((item) => {
      const date = imageDate(item);
      groups.set(date, [...(groups.get(date) || []), item]);
    });
    return Array.from(groups, ([date, rows]) => ({ date, rows }));
  }, [items]);
  const deleteCount = deleteTarget?.length ?? 0;

  const loadImages = async () => {
    setIsLoading(true);
    try {
      const data = await fetchManagedImages({
        start_date: startDate,
        end_date: endDate,
        user_id: userId.trim(),
        channel: channel.trim(),
        page,
        page_size: pageSize,
      });
      setItems(data.items);
      setTotal(data.pagination.total);
      setSelectedItems((current) => {
        const visibleKeys = new Set(data.items.map(imageKey));
        return Object.fromEntries(Object.entries(current).filter(([key]) => visibleKeys.has(key)));
      });
      if (data.pagination.page !== page) {
        setPage(data.pagination.page);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load images");
    } finally {
      setIsLoading(false);
    }
  };

  const loadWebDAVConfig = async () => {
    try {
      const data = await fetchImagesWebDAVConfig();
      setWebdavConfig(data.webdav);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load WebDAV configuration");
    }
  };

  const saveWebDAVConfig = async (payload: ImageWebDAVConfigPayload) => {
    setIsSavingWebDAV(true);
    try {
      const data = await updateImagesWebDAVConfig(payload);
      setWebdavConfig(data.webdav);
      setWebdavOpen(false);
      toast.success("WebDAV configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save WebDAV configuration");
    } finally {
      setIsSavingWebDAV(false);
    }
  };

  const syncToWebDAV = async () => {
    if (!webdavConfig?.enabled) {
      setWebdavOpen(true);
      toast.error("Enable WebDAV configuration first");
      return;
    }
    const selectedIds = selectedTargets
      .map((item) => item.record_id || item.id || "")
      .filter((value) => value.trim());
    if (selectedTargets.length > 0 && selectedIds.length === 0) {
      toast.error("Selected images do not have syncable record IDs");
      return;
    }
    setIsSyncingWebDAV(true);
    try {
      const data = await syncImagesToWebDAV({
        start_date: startDate,
        end_date: endDate,
        user_id: userId.trim(),
        channel: channel.trim(),
        ids: selectedIds,
      });
      const result = data.result;
      const scopeText = selectedIds.length > 0 ? "Selected images" : "Filtered scope";
      toast.success(`${scopeText} synced ${result.uploaded} images, skipped ${result.skipped} images, failed ${result.failed} images`);
      await loadImages();
      await loadWebDAVConfig();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync to WebDAV");
    } finally {
      setIsSyncingWebDAV(false);
    }
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setUserId("");
    setChannel("");
    setSelectedItems({});
    setPage(1);
  };

  const toggleImage = (item: ManagedImage, checked: boolean) => {
    const key = imageKey(item);
    setSelectedItems((current) => {
      const next = { ...current };
      if (checked) {
        next[key] = toDeleteTarget(item);
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const toggleRows = (rows: ManagedImage[], checked: boolean) => {
    setSelectedItems((current) => {
      const next = { ...current };
      rows.forEach((item) => {
        const key = imageKey(item);
        if (checked) {
          next[key] = toDeleteTarget(item);
        } else {
          delete next[key];
        }
      });
      return next;
    });
  };

  const openDeleteSelected = () => {
    if (selectedTargets.length === 0) {
      toast.error("Select images to delete first");
      return;
    }
    setDeleteTarget(selectedTargets);
  };

  const handleDeleteImages = async () => {
    if (!deleteTarget || deleteTarget.length === 0) return;
    setIsDeleting(true);
    try {
      const data = await deleteManagedImages(deleteTarget);
      const deletedKeys = new Set(deleteTarget.map(imageKey));
      setSelectedItems((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !deletedKeys.has(key))));
      setDeleteTarget(null);
      toast.success(`Deleted ${data.removed} images`);
      await loadImages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete images");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    void loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, userId, channel, page]);

  useEffect(() => {
    void loadWebDAVConfig();
  }, []);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Images</div>
          <h1 className="text-2xl font-semibold tracking-tight">Image Management</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
              setPage(1);
            }}
          />
          <Input
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              setPage(1);
            }}
            placeholder="User ID"
            className="h-10 w-44 rounded-xl border-stone-200 bg-white"
          />
          <Input
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value);
              setPage(1);
            }}
            placeholder="Channel"
            className="h-10 w-40 rounded-xl border-stone-200 bg-white"
          />
          <Button variant="outline" onClick={() => setWebdavOpen(true)} className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700">
            <Settings className="size-4" />
            WebDAV
          </Button>
          <Button variant="outline" onClick={() => void syncToWebDAV()} disabled={isSyncingWebDAV} className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700">
            {isSyncingWebDAV ? <LoaderCircle className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
            Sync
          </Button>
          <Button variant="outline" onClick={clearFilters} className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700">
            Clear Filters
          </Button>
          <Button onClick={() => void loadImages()} disabled={isLoading} className="h-10 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800">
            {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </Button>
        </div>
      </div>

      <Card className="rounded-lg border-white/80 bg-white/80 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
              <span className="flex items-center gap-2">
                <ImageIcon className="size-4" />
                Total {total} images
              </span>
              {selectedCount > 0 ? <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">Selected {selectedCount} images</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-600">
                <Checkbox
                  checked={allCurrentSelected ? true : someCurrentSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => toggleRows(items, checked === true)}
                  aria-label="Select images on this page"
                  disabled={items.length === 0 || isLoading}
                />
                Select Page
              </div>
              {selectedCount > 0 ? (
                <Button variant="ghost" className="h-8 rounded-lg px-3 text-stone-500" onClick={() => setSelectedItems({})}>
                  <X className="size-4" />
                  Clear Selection
                </Button>
              ) : null}
              <Button
                variant="destructive"
                className="h-8 rounded-lg px-3"
                onClick={openDeleteSelected}
                disabled={selectedCount === 0 || isLoading || isDeleting}
              >
                {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete Selected
              </Button>
              <Button variant="ghost" className="h-8 rounded-lg px-3 text-stone-500" onClick={() => void loadImages()} disabled={isLoading}>
                <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-stone-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-stone-500">No images found</div>
          ) : (
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {dateGroups.map((group) => {
                const groupSelected = group.rows.filter((item) => selectedItems[imageKey(item)]).length;
                const allGroupSelected = group.rows.length > 0 && groupSelected === group.rows.length;
                const someGroupSelected = groupSelected > 0 && !allGroupSelected;
                return (
                  <div key={group.date} className="contents">
                    <div className="col-span-full flex items-center justify-between border-b border-stone-100 bg-stone-50/70 px-4 py-3 text-sm text-stone-600">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false}
                          onCheckedChange={(checked) => toggleRows(group.rows, checked === true)}
                          aria-label={`Select ${group.date} images`}
                        />
                        <CalendarDays className="size-4 text-stone-400" />
                        <span className="font-medium text-stone-800">{group.date}</span>
                      </div>
                      <span className="text-xs text-stone-500">{group.rows.length} images</span>
                    </div>
                    {group.rows.map((item) => {
                      const key = imageKey(item);
                      const selected = Boolean(selectedItems[key]);
                      return (
                        <div
                          key={key}
                          className={`group relative border-r border-b border-stone-100 p-4 transition hover:bg-stone-50 ${selected ? "bg-stone-50 ring-1 ring-inset ring-stone-300" : ""}`}
                        >
                          <div className="absolute top-6 left-6 z-10 rounded-md bg-white/90 p-1 shadow-sm">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => toggleImage(item, checked === true)}
                              aria-label="Select Image"
                              className="size-5 border-stone-300 bg-white"
                            />
                          </div>
                          <button
                            type="button"
                            className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg bg-stone-100 text-left"
                            onClick={() => {
                              setLightboxIndex(items.findIndex((row) => imageKey(row) === key));
                              setLightboxOpen(true);
                            }}
                          >
                            <img
                              src={item.url}
                              alt={item.name}
                              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                              onLoad={(event) => {
                                const image = event.currentTarget;
                                setDimensions((current) => ({
                                  ...current,
                                  [item.url]: `${image.naturalWidth} x ${image.naturalHeight}`,
                                }));
                              }}
                            />
                            <span className="absolute right-2 bottom-2 rounded-full bg-black/50 p-2 text-white opacity-0 transition group-hover:opacity-100">
                              <Maximize2 className="size-4" />
                            </span>
                          </button>
                          <div className="mt-3 space-y-1 text-xs text-stone-500">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1 font-medium text-stone-700">
                                <CalendarDays className="size-3.5" />
                                {item.created_at}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                                onClick={() => {
                                  void navigator.clipboard.writeText(item.url);
                                  toast.success("Image URL copied");
                                }}
                                aria-label="Copy Image URL"
                                title="Copy Image URL"
                              >
                                <Copy className="size-4" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span>{formatSize(item.size)}</span>
                              <span>{dimensions[item.url] || "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">{item.owner_email || item.owner_name || item.owner_user_id || "System"}</span>
                              <span className="shrink-0">{item.channel || "-"}</span>
                            </div>
                            {item.webdav_status === "synced" ? <div className="text-stone-400">WebDAV synced</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {!isLoading && total > 0 ? (
            <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-4 py-3 text-sm text-stone-500">
              <span>
                Page {safePage} / {pageCount} of {total} images
              </span>
              <Button variant="outline" size="icon" className="size-9 rounded-lg border-stone-200 bg-white" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" className="size-9 rounded-lg border-stone-200 bg-white" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
      <WebDAVSettingsDialog
        open={webdavOpen}
        onOpenChange={setWebdavOpen}
        config={webdavConfig}
        isSaving={isSavingWebDAV}
        title="WebDAV Settings"
        description="Save admin images to a remote directory"
        onSave={saveWebDAVConfig}
      />
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteCount === 1 ? "Delete Images" : "Delete Images"}</DialogTitle>
            <DialogDescription>Delete the selected {deleteCount} images? Image files and management records cannot be restored after deletion.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteImages()} disabled={isDeleting}>
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function ImageManagerPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);
  if (isCheckingAuth || !session || session.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }
  return <ImageManagerContent />;
}
