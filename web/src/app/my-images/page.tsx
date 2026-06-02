"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, ImageIcon, LoaderCircle, Maximize2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DateRangeFilter } from "@/components/date-range-filter";
import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchMyImages, type ManagedImage } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

function formatSize(size: number) {
  if (!size) return "-";
  return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(size / 1024)} KB`;
}

function MyImagesContent() {
  const [items, setItems] = useState<ManagedImage[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const lightboxImages = items.map((item) => ({
    id: item.name,
    src: item.url,
    sizeLabel: formatSize(item.size),
  }));

  const loadImages = async () => {
    setIsLoading(true);
    try {
      const data = await fetchMyImages({ start_date: startDate, end_date: endDate, page, page_size: pageSize });
      setItems(data.items);
      setTotal(data.pagination.total);
      if (data.pagination.page !== page) {
        setPage(data.pagination.page);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载图片失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, page]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-rose-400 uppercase">My Images</div>
          <h1 className="text-2xl font-semibold tracking-tight">我的图片</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <DateRangeFilter startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); setPage(1); }} />
          <Button variant="outline" onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }} className="h-10 rounded-xl border-rose-100 bg-white px-4 text-stone-700">
            清除筛选
          </Button>
          <Button onClick={() => void loadImages()} disabled={isLoading} className="h-10 rounded-xl bg-rose-500 px-4 text-white hover:bg-rose-600">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </div>

      <Card className="rounded-lg border-white/80 bg-white/80 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-rose-50 px-5 py-4 text-sm text-stone-600">
            <ImageIcon className="size-4 text-rose-500" />
            共 {total} 张
          </div>
          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-rose-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-stone-500">还没有生成过图片</div>
          ) : (
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item, index) => (
                <div key={`${item.url}-${index}`} className="group border-r border-b border-rose-50 p-4 transition hover:bg-rose-50/40">
                  <button
                    type="button"
                    className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl bg-rose-50 text-left"
                    onClick={() => {
                      setLightboxIndex(index);
                      setLightboxOpen(true);
                    }}
                  >
                    <img src={item.url} alt={item.name} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
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
                        className="size-8 rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => {
                          void navigator.clipboard.writeText(item.url);
                          toast.success("图片地址已复制");
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                    <div>{formatSize(item.size)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoading && total > 0 ? (
            <div className="flex items-center justify-end gap-2 border-t border-rose-50 px-4 py-3 text-sm text-stone-500">
              <span>第 {safePage} / {pageCount} 页，共 {total} 张</span>
              <Button variant="outline" size="icon" className="size-9 rounded-lg border-rose-100 bg-white" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" className="size-9 rounded-lg border-rose-100 bg-white" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
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
    </section>
  );
}

export default function MyImagesPage() {
  const { isCheckingAuth, session } = useAuthGuard(["user"]);
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-rose-400" />
      </div>
    );
  }
  return <MyImagesContent />;
}
