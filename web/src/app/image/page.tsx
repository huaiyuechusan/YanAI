"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ImageComposer } from "@/app/image/components/image-composer";
import { ImageResults, type ImageLightboxItem } from "@/app/image/components/image-results";
import { ImageSidebar } from "@/app/image/components/image-sidebar";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { editImage, fetchAccounts, fetchMe, generateImage, type Account } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  clearImageConversations,
  deleteImageConversation,
  getImageConversationOwnerKey,
  getImageConversationStats,
  IMAGE_CONVERSATIONS_CHANGED_EVENT,
  listImageConversations,
  saveImageConversation,
  saveImageConversations,
  type ImageConversationsChangedDetail,
  type ImageConversation,
  type ImageConversationMode,
  type ImageTurn,
  type ImageTurnStatus,
  type StoredImage,
  type StoredReferenceImage,
} from "@/store/image-conversations";
import type { StoredAuthSession } from "@/store/auth";

const ACTIVE_CONVERSATION_STORAGE_KEY = "chatgpt2api:image_active_conversation_id";
const IMAGE_SIZE_STORAGE_KEY = "chatgpt2api:image_last_size";
const activeConversationQueueIds = new Set<string>();

function getScopedStorageKey(baseKey: string, ownerKey: string) {
  return ownerKey ? `${baseKey}:${ownerKey}` : baseKey;
}

function buildConversationTitle(prompt: string) {
  const trimmed = prompt.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 12)}...`;
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatAvailableQuota(accounts: Account[]) {
  const availableAccounts = accounts.filter((account) => account.status !== "禁用");
  return String(availableAccounts.reduce((sum, account) => sum + Math.max(0, account.quota), 0));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType?: string) {
  const [header, content] = dataUrl.split(",", 2);
  const matchedMimeType = header.match(/data:(.*?);base64/)?.[1];
  const binary = atob(content || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType || matchedMimeType || "image/png" });
}

function buildReferenceImageFromResult(image: StoredImage, fileName: string): StoredReferenceImage | null {
  if (!image.b64_json) {
    return null;
  }

  return {
    name: fileName,
    type: "image/png",
    dataUrl: `data:image/png;base64,${image.b64_json}`,
  };
}

function pickFallbackConversationId(conversations: ImageConversation[]) {
  const activeConversation = conversations.find((conversation) =>
    conversation.turns.some((turn) => turn.status === "queued" || turn.status === "generating"),
  );
  return activeConversation?.id ?? conversations[0]?.id ?? null;
}

function sortImageConversations(conversations: ImageConversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function isSameLocalDay(value: string, date = new Date()) {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return false;
  }
  return (
    target.getFullYear() === date.getFullYear() &&
    target.getMonth() === date.getMonth() &&
    target.getDate() === date.getDate()
  );
}

function getWorkspaceStats(conversations: ImageConversation[]) {
  let todayGenerated = 0;
  let successImages = 0;
  let failedImages = 0;
  let queued = 0;
  let running = 0;

  for (const conversation of conversations) {
    const stats = getImageConversationStats(conversation);
    queued += stats.queued;
    running += stats.running;

    for (const turn of conversation.turns) {
      for (const image of turn.images) {
        if (image.status === "success") {
          successImages += 1;
          if (isSameLocalDay(turn.createdAt)) {
            todayGenerated += 1;
          }
        } else if (image.status === "error") {
          failedImages += 1;
        }
      }
    }
  }

  const completed = successImages + failedImages;
  return {
    todayGenerated,
    successImages,
    failedImages,
    queued,
    running,
    active: queued + running,
    successRate: completed > 0 ? `${((successImages / completed) * 100).toFixed(1)}%` : "--",
  };
}

function conversationMatchesQuery(conversation: ImageConversation, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    conversation.title.toLowerCase().includes(normalizedQuery) ||
    conversation.turns.some((turn) =>
      [turn.prompt, turn.mode, turn.status, turn.size].some((value) =>
        String(value || "").toLowerCase().includes(normalizedQuery),
      ),
    )
  );
}

async function recoverConversationHistory(
  items: ImageConversation[],
  ownerKey: string,
  options: { isConversationQueueActive?: (conversationId: string) => boolean } = {},
) {
  const normalized = items.map((conversation) => {
    let changed = false;
    const isConversationQueueActive = options.isConversationQueueActive?.(conversation.id) ?? false;

    const turns = conversation.turns.map((turn) => {
      if (turn.status !== "queued" && turn.status !== "generating") {
        return turn;
      }

      const loadingCount = turn.images.filter((image) => image.status === "loading").length;
      if (turn.status === "generating" && loadingCount > 0 && !isConversationQueueActive) {
        const message = "页面刷新或任务中断，未完成的图片已标记为失败";
        changed = true;
        return {
          ...turn,
          status: "error" as const,
          error: message,
          images: turn.images.map((image) =>
            image.status === "loading" ? { ...image, status: "error" as const, error: message } : image,
          ),
        };
      }

      if (loadingCount > 0) {
        return turn;
      }

      const failedCount = turn.images.filter((image) => image.status === "error").length;
      const successCount = turn.images.filter((image) => image.status === "success").length;
      const nextStatus: ImageTurnStatus =
        failedCount > 0 ? "error" : successCount > 0 ? "success" : "queued";
      const nextError = failedCount > 0 ? turn.error || `其中 ${failedCount} 张未成功生成` : undefined;
      if (nextStatus === turn.status && nextError === turn.error) {
        return turn;
      }

      changed = true;
      return {
        ...turn,
        status: nextStatus,
        error: nextError,
      };
    });

    if (!changed) {
      return conversation;
    }

    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    return {
      ...conversation,
      turns,
      updatedAt: lastTurn?.createdAt || conversation.updatedAt,
    };
  });

  const changedConversations = normalized.filter((conversation, index) => conversation !== items[index]);
  if (changedConversations.length > 0) {
    await saveImageConversations(normalized, ownerKey);
  }

  return normalized;
}

function ImagePageContent({ session }: { session: StoredAuthSession }) {
  const didLoadQuotaRef = useRef(false);
  const conversationsRef = useRef<ImageConversation[]>([]);
  const resultsViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageCount, setImageCount] = useState("1");
  const [imageMode, setImageMode] = useState<ImageConversationMode>("generate");
  const [imageSize, setImageSize] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [referenceImageFiles, setReferenceImageFiles] = useState<File[]>([]);
  const [referenceImages, setReferenceImages] = useState<StoredReferenceImage[]>([]);
  const [conversations, setConversations] = useState<ImageConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [availableQuota, setAvailableQuota] = useState("加载中...");
  const [lightboxImages, setLightboxImages] = useState<ImageLightboxItem[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "one"; id: string } | { type: "all" } | null>(null);

  const isAdmin = session.role === "admin";
  const imageConversationOwnerKey = useMemo(() => getImageConversationOwnerKey(session), [session]);
  const activeConversationStorageKey = useMemo(
    () => getScopedStorageKey(ACTIVE_CONVERSATION_STORAGE_KEY, imageConversationOwnerKey),
    [imageConversationOwnerKey],
  );
  const imageSizeStorageKey = useMemo(
    () => getScopedStorageKey(IMAGE_SIZE_STORAGE_KEY, imageConversationOwnerKey),
    [imageConversationOwnerKey],
  );
  const parsedCount = useMemo(() => Math.max(1, Math.min(10, Number(imageCount) || 1)), [imageCount]);
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const activeTaskCount = useMemo(
    () =>
      conversations.reduce((sum, conversation) => {
        const stats = getImageConversationStats(conversation);
        return sum + stats.queued + stats.running;
      }, 0),
    [conversations],
  );
  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => conversationMatchesQuery(conversation, workspaceSearch)),
    [conversations, workspaceSearch],
  );
  const workspaceStats = useMemo(() => getWorkspaceStats(conversations), [conversations]);
  const deleteConfirmTitle = deleteConfirm?.type === "all" ? "清空历史记录" : deleteConfirm?.type === "one" ? "删除对话" : "";
  const deleteConfirmDescription =
    deleteConfirm?.type === "all"
      ? "确认删除全部图片历史记录吗？删除后无法恢复。"
      : deleteConfirm?.type === "one"
        ? "确认删除这条图片对话吗？删除后无法恢复。"
        : "";

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    let cancelled = false;

    const isConversationQueueActive = (conversationId: string) =>
      activeConversationQueueIds.has(`${imageConversationOwnerKey}:${conversationId}`);

    const loadHistory = async ({ resetBeforeLoad = false }: { resetBeforeLoad?: boolean } = {}) => {
      if (resetBeforeLoad) {
        conversationsRef.current = [];
        setIsLoadingHistory(true);
        setConversations([]);
        setSelectedConversationId(null);
      }

      try {
        if (resetBeforeLoad) {
          const storedSize = typeof window !== "undefined" ? window.localStorage.getItem(imageSizeStorageKey) : null;
          setImageSize(storedSize || "");
        }

        const items = await listImageConversations(imageConversationOwnerKey);
        const normalizedItems = await recoverConversationHistory(items, imageConversationOwnerKey, {
          isConversationQueueActive,
        });
        if (cancelled) {
          return;
        }

        conversationsRef.current = normalizedItems;
        setConversations(normalizedItems);
        const storedConversationId =
          typeof window !== "undefined" ? window.localStorage.getItem(activeConversationStorageKey) : null;
        setSelectedConversationId((currentConversationId) => {
          if (
            currentConversationId &&
            normalizedItems.some((conversation) => conversation.id === currentConversationId)
          ) {
            return currentConversationId;
          }
          return (
            (storedConversationId && normalizedItems.some((conversation) => conversation.id === storedConversationId)
              ? storedConversationId
              : null) ?? pickFallbackConversationId(normalizedItems)
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取会话记录失败";
        toast.error(message);
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    const handleConversationsChanged = (event: Event) => {
      const detail = (event as CustomEvent<ImageConversationsChangedDetail>).detail;
      if (detail?.ownerKey !== imageConversationOwnerKey) {
        return;
      }
      void loadHistory();
    };

    window.addEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleConversationsChanged);
    void loadHistory({ resetBeforeLoad: true });
    return () => {
      cancelled = true;
      window.removeEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleConversationsChanged);
    };
  }, [activeConversationStorageKey, imageConversationOwnerKey, imageSizeStorageKey]);

  const loadQuota = useCallback(async () => {
    if (!isAdmin) {
      try {
        const data = await fetchMe();
        setAvailableQuota(String(data.user.quota ?? 0));
      } catch {
        setAvailableQuota("--");
      }
      return;
    }
    try {
      const data = await fetchAccounts();
      setAvailableQuota(formatAvailableQuota(data.items));
    } catch {
      setAvailableQuota((prev) => (prev === "加载中..." ? "--" : prev));
    }
  }, [isAdmin]);

  useEffect(() => {
    if (didLoadQuotaRef.current) {
      return;
    }
    didLoadQuotaRef.current = true;

    const handleFocus = () => {
      void loadQuota();
    };

    void loadQuota();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAdmin, loadQuota]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    resultsViewportRef.current?.scrollTo({
      top: resultsViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [selectedConversation?.updatedAt, selectedConversation?.turns.length, selectedConversation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (isLoadingHistory) {
      return;
    }

    if (selectedConversationId) {
      window.localStorage.setItem(activeConversationStorageKey, selectedConversationId);
    } else {
      window.localStorage.removeItem(activeConversationStorageKey);
    }
  }, [activeConversationStorageKey, isLoadingHistory, selectedConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (isLoadingHistory) {
      return;
    }

    if (imageSize) {
      window.localStorage.setItem(imageSizeStorageKey, imageSize);
      return;
    }
    window.localStorage.removeItem(imageSizeStorageKey);
  }, [imageSize, imageSizeStorageKey, isLoadingHistory]);

  useEffect(() => {
    if (selectedConversationId && !conversations.some((conversation) => conversation.id === selectedConversationId)) {
      const timeout = window.setTimeout(() => {
        setSelectedConversationId(pickFallbackConversationId(conversations));
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [conversations, selectedConversationId]);

  const persistConversation = async (conversation: ImageConversation) => {
    const nextConversations = sortImageConversations([
      conversation,
      ...conversationsRef.current.filter((item) => item.id !== conversation.id),
    ]);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    await saveImageConversation(conversation, imageConversationOwnerKey);
  };

  const updateConversation = useCallback(
    async (
      conversationId: string,
      updater: (current: ImageConversation | null) => ImageConversation,
      options: { persist?: boolean } = {},
    ) => {
      const current = conversationsRef.current.find((item) => item.id === conversationId) ?? null;
      const nextConversation = updater(current);
      const nextConversations = sortImageConversations([
        nextConversation,
        ...conversationsRef.current.filter((item) => item.id !== conversationId),
      ]);
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      if (options.persist !== false) {
        await saveImageConversation(nextConversation, imageConversationOwnerKey);
      }
    },
    [imageConversationOwnerKey],
  );

  const clearComposerInputs = useCallback(() => {
    setImagePrompt("");
    setImageCount("1");
    setReferenceImageFiles([]);
    setReferenceImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const resetComposer = useCallback(() => {
    setImageMode("generate");
    clearComposerInputs();
  }, [clearComposerInputs]);

  const handleCreateDraft = () => {
    setSelectedConversationId(null);
    resetComposer();
    textareaRef.current?.focus();
  };

  const handleDeleteConversation = async (id: string) => {
    const nextConversations = conversations.filter((item) => item.id !== id);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    if (selectedConversationId === id) {
      setSelectedConversationId(pickFallbackConversationId(nextConversations));
      resetComposer();
    }

    try {
      await deleteImageConversation(id, imageConversationOwnerKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除会话失败";
      toast.error(message);
      const items = await listImageConversations(imageConversationOwnerKey);
      conversationsRef.current = items;
      setConversations(items);
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearImageConversations(imageConversationOwnerKey);
      conversationsRef.current = [];
      setConversations([]);
      setSelectedConversationId(null);
      resetComposer();
      toast.success("已清空历史记录");
    } catch (error) {
      const message = error instanceof Error ? error.message : "清空历史记录失败";
      toast.error(message);
    }
  };

  const openDeleteConversationConfirm = (id: string) => {
    setIsHistoryOpen(false);
    setDeleteConfirm({ type: "one", id });
  };

  const openClearHistoryConfirm = () => {
    setIsHistoryOpen(false);
    setDeleteConfirm({ type: "all" });
  };

  const handleConfirmDelete = async () => {
    const target = deleteConfirm;
    setDeleteConfirm(null);
    if (!target) {
      return;
    }
    if (target.type === "all") {
      await handleClearHistory();
      return;
    }
    await handleDeleteConversation(target.id);
  };

  const appendReferenceImages = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    try {
      const previews = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type || "image/png",
          dataUrl: await readFileAsDataUrl(file),
        })),
      );

      setReferenceImageFiles((prev) => [...prev, ...files]);
      setReferenceImages((prev) => [...prev, ...previews]);
      setImageMode("edit");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取参考图失败";
      toast.error(message);
    }
  }, []);

  const handleReferenceImageChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      await appendReferenceImages(files);
    },
    [appendReferenceImages],
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setReferenceImageFiles((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      if (next.length === 0 && fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return next;
    });
    setReferenceImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const handleContinueEdit = useCallback(
    (conversationId: string, image: StoredImage | StoredReferenceImage) => {
      const nextReferenceImage =
        "dataUrl" in image
          ? image
          : buildReferenceImageFromResult(image, `conversation-${conversationId}-${Date.now()}.png`);
      if (!nextReferenceImage) {
        return;
      }

      setSelectedConversationId(conversationId);
      setImageMode("edit");
      setReferenceImages((prev) => [...prev, nextReferenceImage]);
      setReferenceImageFiles((prev) => [
        ...prev,
        dataUrlToFile(nextReferenceImage.dataUrl, nextReferenceImage.name, nextReferenceImage.type),
      ]);
      setImagePrompt("");
      textareaRef.current?.focus();
      toast.success("已加入当前参考图，继续输入描述即可编辑");
    },
    [],
  );

  const openLightbox = useCallback((images: ImageLightboxItem[], index: number) => {
    if (images.length === 0) {
      return;
    }

    setLightboxImages(images);
    setLightboxIndex(Math.max(0, Math.min(index, images.length - 1)));
    setLightboxOpen(true);
  }, []);

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const runConversationQueue = useCallback(
    async (conversationId: string) => {
      const queueId = `${imageConversationOwnerKey}:${conversationId}`;
      if (activeConversationQueueIds.has(queueId)) {
        return;
      }

      const snapshot = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const queuedTurn = snapshot?.turns.find((turn) => turn.status === "queued");
      if (!snapshot || !queuedTurn) {
        return;
      }

      activeConversationQueueIds.add(queueId);
      await updateConversation(conversationId, (current) => {
        const conversation = current ?? snapshot;
        return {
          ...conversation,
          updatedAt: new Date().toISOString(),
          turns: conversation.turns.map((turn) =>
            turn.id === queuedTurn.id
              ? {
                  ...turn,
                  status: "generating",
                  error: undefined,
                }
              : turn,
          ),
        };
      });

      try {
        const referenceFiles = queuedTurn.referenceImages.map((image, index) =>
          dataUrlToFile(image.dataUrl, image.name || `${queuedTurn.id}-${index + 1}.png`, image.type),
        );
        const pendingImages = queuedTurn.images.filter((image) => image.status === "loading");

        if (queuedTurn.mode === "edit" && referenceFiles.length === 0) {
          throw new Error("未找到可用于继续编辑的参考图");
        }

        if (pendingImages.length === 0) {
          const existingFailedCount = queuedTurn.images.filter((image) => image.status === "error").length;
          const existingSuccessCount = queuedTurn.images.filter((image) => image.status === "success").length;
          await updateConversation(conversationId, (current) => {
            const conversation = current ?? snapshot;
            return {
              ...conversation,
              updatedAt: new Date().toISOString(),
              turns: conversation.turns.map((turn) =>
                turn.id === queuedTurn.id
                  ? {
                      ...turn,
                      status: existingFailedCount > 0 ? "error" : existingSuccessCount > 0 ? "success" : "queued",
                      error: existingFailedCount > 0 ? `其中 ${existingFailedCount} 张未成功生成` : undefined,
                    }
                  : turn,
              ),
            };
          });
          return;
        }

        const tasks = pendingImages.map(async (pendingImage) => {
          try {
            const data =
              queuedTurn.mode === "edit"
                ? await editImage(referenceFiles, queuedTurn.prompt, queuedTurn.model, queuedTurn.size)
                : await generateImage(queuedTurn.prompt, queuedTurn.model, queuedTurn.size);
            const first = data.data?.[0];
            if (!first?.b64_json && !first?.url) {
              throw new Error("未返回图片数据");
            }

            const nextImage: StoredImage = {
              id: pendingImage.id,
              status: "success",
              b64_json: first.b64_json,
              url: first.url,
            };

            await updateConversation(
              conversationId,
              (current) => {
                const conversation = current ?? snapshot;
                return {
                  ...conversation,
                  updatedAt: new Date().toISOString(),
                  turns: conversation.turns.map((turn) =>
                    turn.id === queuedTurn.id
                      ? {
                          ...turn,
                          images: turn.images.map((image) => (image.id === nextImage.id ? nextImage : image)),
                        }
                      : turn,
                  ),
                };
              },
              { persist: false },
            );

            return nextImage;
          } catch (error) {
            const message = error instanceof Error ? error.message : "生成失败";
            const failedImage: StoredImage = {
              id: pendingImage.id,
              status: "error",
              error: message,
            };

            await updateConversation(
              conversationId,
              (current) => {
                const conversation = current ?? snapshot;
                return {
                  ...conversation,
                  updatedAt: new Date().toISOString(),
                  turns: conversation.turns.map((turn) =>
                    turn.id === queuedTurn.id
                      ? {
                          ...turn,
                          images: turn.images.map((image) => (image.id === failedImage.id ? failedImage : image)),
                        }
                      : turn,
                  ),
                };
              },
              { persist: false },
            );

            throw error;
          }
        });

        const settled = await Promise.allSettled(tasks);
        const resumedSuccessCount = settled.filter(
          (item): item is PromiseFulfilledResult<StoredImage> => item.status === "fulfilled",
        ).length;
        const resumedFailedCount = settled.length - resumedSuccessCount;
        const existingSuccessCount = queuedTurn.images.filter((image) => image.status === "success").length;
        const existingFailedCount = queuedTurn.images.filter((image) => image.status === "error").length;
        const successCount = existingSuccessCount + resumedSuccessCount;
        const failedCount = existingFailedCount + resumedFailedCount;

        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === queuedTurn.id
                ? {
                    ...turn,
                    status: failedCount > 0 ? "error" : "success",
                    error: failedCount > 0 ? `其中 ${failedCount} 张未成功生成` : undefined,
                  }
                : turn,
            ),
          };
        });

        await loadQuota();
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成图片失败";
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === queuedTurn.id
                ? {
                    ...turn,
                    status: "error",
                    error: message,
                    images: turn.images.map((image) =>
                      image.status === "loading" ? { ...image, status: "error", error: message } : image,
                    ),
                  }
                : turn,
            ),
          };
        });
        toast.error(message);
      } finally {
        activeConversationQueueIds.delete(queueId);
        for (const conversation of conversationsRef.current) {
          const nextQueueId = `${imageConversationOwnerKey}:${conversation.id}`;
          if (
            !activeConversationQueueIds.has(nextQueueId) &&
            conversation.turns.some((turn) => turn.status === "queued")
          ) {
            void runConversationQueue(conversation.id);
          }
        }
      }
    },
    [imageConversationOwnerKey, loadQuota, updateConversation],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  useEffect(() => {
    for (const conversation of conversations) {
      if (
        !activeConversationQueueIds.has(`${imageConversationOwnerKey}:${conversation.id}`) &&
        conversation.turns.some((turn) => turn.status === "queued")
      ) {
        void runConversationQueue(conversation.id);
      }
    }
  }, [conversations, imageConversationOwnerKey, runConversationQueue]);

  const handleSubmit = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt) {
      toast.error("请输入提示词");
      return;
    }

    if (imageMode === "edit" && referenceImageFiles.length === 0) {
      toast.error("请先上传参考图");
      return;
    }

    const targetConversation = selectedConversationId
      ? conversationsRef.current.find((conversation) => conversation.id === selectedConversationId) ?? null
      : null;
    const now = new Date().toISOString();
    const conversationId = targetConversation?.id ?? createId();
    const turnId = createId();
    const draftTurn: ImageTurn = {
      id: turnId,
      prompt,
      model: "gpt-image-2",
      mode: imageMode,
      referenceImages: imageMode === "edit" ? referenceImages : [],
      count: parsedCount,
      size: imageSize,
      images: Array.from({ length: parsedCount }, (_, index) => ({
        id: `${turnId}-${index}`,
        status: "loading" as const,
      })),
      createdAt: now,
      status: "queued",
    };

    const baseConversation: ImageConversation = targetConversation
      ? {
          ...targetConversation,
          ownerKey: imageConversationOwnerKey,
          updatedAt: now,
          turns: [...targetConversation.turns, draftTurn],
        }
      : {
          id: conversationId,
          ownerKey: imageConversationOwnerKey,
          title: buildConversationTitle(prompt),
          createdAt: now,
          updatedAt: now,
          turns: [draftTurn],
        };

    setSelectedConversationId(conversationId);
    clearComposerInputs();

    await persistConversation(baseConversation);
    void runConversationQueue(conversationId);

    const targetStats = getImageConversationStats(baseConversation);
    if (targetStats.running > 0 || targetStats.queued > 1) {
      toast.success("已加入当前对话队列");
    } else if (!targetConversation) {
      toast.success("已创建新对话并开始处理");
    } else {
      toast.success("已发送到当前对话");
    }
  };

  return (
    <>
      <section className="grid h-full min-h-0 w-full grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)_420px]">
        <div className="yan-panel hidden min-h-0 overflow-hidden rounded-lg lg:row-span-2 lg:flex xl:row-span-1">
          <ImageStudioSidebar
            conversations={filteredConversations}
            isLoadingHistory={isLoadingHistory}
            selectedConversationId={selectedConversationId}
            availableQuota={availableQuota}
            onCreateDraft={handleCreateDraft}
            onClearHistory={openClearHistoryConfirm}
            onSelectConversation={setSelectedConversationId}
            onDeleteConversation={openDeleteConversationConfirm}
            formatConversationTime={formatConversationTime}
          />
        </div>

        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="flex h-[88vh] w-[92vw] max-w-[430px] flex-col overflow-hidden rounded-lg p-0">
            <DialogTitle className="sr-only">历史记录</DialogTitle>
            <ImageStudioSidebar
              conversations={filteredConversations}
              isLoadingHistory={isLoadingHistory}
              selectedConversationId={selectedConversationId}
              availableQuota={availableQuota}
              onCreateDraft={() => {
                handleCreateDraft();
                setIsHistoryOpen(false);
              }}
              onClearHistory={openClearHistoryConfirm}
              onSelectConversation={(id) => {
                setSelectedConversationId(id);
                setIsHistoryOpen(false);
              }}
              onDeleteConversation={openDeleteConversationConfirm}
              formatConversationTime={formatConversationTime}
            />
          </DialogContent>
        </Dialog>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between gap-2 lg:hidden">
            <Button
              variant="outline"
              className="h-10 flex-1 rounded-lg border-rose-100 bg-white/75 text-stone-700 shadow-sm"
              onClick={() => setIsHistoryOpen(true)}
            >
              <Menu className="mr-2 size-4" />
              历史记录 ({conversations.length})
            </Button>
            <Button className="h-10 rounded-lg text-white shadow-sm" onClick={handleCreateDraft}>
              <Plus className="size-4" />
              新建
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-lg border-rose-100 bg-white/75 px-3 text-stone-600 shadow-sm"
              onClick={openClearHistoryConfirm}
              disabled={conversations.length === 0}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <header className="yan-panel flex min-h-16 flex-col gap-3 rounded-lg px-4 py-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold tracking-tight text-stone-950">月光影像创作台</h1>
              <p className="mt-1 truncate text-sm text-stone-500">
                gpt-image-2 · 创作队列 {workspaceStats.active} · 当前空间 颜AI Studio
              </p>
            </div>
            <label className="relative w-full md:max-w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input
                value={workspaceSearch}
                onChange={(event) => setWorkspaceSearch(event.target.value)}
                placeholder="搜索作品、提示词、会话"
                className="h-10 w-full rounded-lg border border-[var(--yan-border)] bg-white/72 pl-9 pr-3 text-sm text-stone-700 outline-none transition placeholder:text-stone-400 focus:border-rose-200 focus:bg-white focus:ring-4 focus:ring-rose-100/60"
              />
            </label>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <WorkspaceMetric label="今日生成" value={workspaceStats.todayGenerated} />
            <WorkspaceMetric label="成功率" value={workspaceStats.successRate} />
            <WorkspaceMetric label="处理中" value={workspaceStats.active} />
            <WorkspaceMetric label="历史作品" value={workspaceStats.successImages} />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <div ref={resultsViewportRef} className="yan-panel h-full min-h-0 overflow-y-auto rounded-lg">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rose-100/70 bg-white/72 px-4 py-3 backdrop-blur-xl">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-stone-950">生成画面</h2>
                  <p className="truncate text-sm text-stone-500">
                    {selectedConversation ? `${selectedConversation.turns.length} 轮创作 · 精选结果` : "选择会话或新建创作"}
                  </p>
                </div>
                <div className="hidden items-center gap-2 text-xs font-medium text-stone-400 sm:flex">
                  <span>{workspaceStats.queued} 排队</span>
                  <span>{workspaceStats.running} 运行中</span>
                </div>
              </div>
              <div className="px-3 py-4 sm:px-4">
                <ImageResults
                  selectedConversation={selectedConversation}
                  onOpenLightbox={openLightbox}
                  onContinueEdit={handleContinueEdit}
                  formatConversationTime={formatConversationTime}
                />
              </div>
            </div>
          </div>
        </div>

        <aside className="yan-panel min-h-0 overflow-hidden rounded-lg lg:col-span-2 xl:col-span-1">
          <ImageComposer
            mode={imageMode}
            prompt={imagePrompt}
            imageCount={imageCount}
            imageSize={imageSize}
            availableQuota={availableQuota}
            activeTaskCount={activeTaskCount}
            referenceImages={referenceImages}
            textareaRef={textareaRef}
            fileInputRef={fileInputRef}
            onModeChange={setImageMode}
            onPromptChange={setImagePrompt}
            onImageCountChange={setImageCount}
            onImageSizeChange={setImageSize}
            onSubmit={handleSubmit}
            onPickReferenceImage={() => fileInputRef.current?.click()}
            onReferenceImageChange={handleReferenceImageChange}
            onRemoveReferenceImage={handleRemoveReferenceImage}
          />
        </aside>
      </section>

      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />

      {deleteConfirm ? (
        <Dialog open onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-lg p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>{deleteConfirmTitle}</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                {deleteConfirmDescription}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                取消
              </Button>
              <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => void handleConfirmDelete()}>
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function ImageStudioSidebar({
  conversations,
  isLoadingHistory,
  selectedConversationId,
  availableQuota,
  onCreateDraft,
  onClearHistory,
  onSelectConversation,
  onDeleteConversation,
  formatConversationTime,
}: {
  conversations: ImageConversation[];
  isLoadingHistory: boolean;
  selectedConversationId: string | null;
  availableQuota: string;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-white/32">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgba(244,114,182,.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-rose-300/55 [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="min-h-[320px]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-stone-500">最近会话</div>
              <div className="mt-1 text-[11px] text-stone-400">{conversations.length} 条记录</div>
            </div>
          </div>
          <ImageSidebar
            conversations={conversations}
            isLoadingHistory={isLoadingHistory}
            selectedConversationId={selectedConversationId}
            onCreateDraft={onCreateDraft}
            onClearHistory={onClearHistory}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
            formatConversationTime={formatConversationTime}
          />
        </div>
      </div>

      <div className="border-t border-rose-100/70 p-3">
        <div className="rounded-lg bg-gradient-to-br from-white/80 to-rose-50/80 p-3">
          <div className="text-sm text-stone-500">剩余额度</div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-stone-950">{availableQuota}</div>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="yan-panel-strong rounded-lg px-4 py-3">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-stone-950">{value}</div>
    </div>
  );
}

export default function ImagePage() {
  const { isCheckingAuth, session } = useAuthGuard();

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <ImagePageContent session={session} />;
}
