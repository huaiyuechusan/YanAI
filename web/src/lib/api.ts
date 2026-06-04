import { httpRequest } from "@/lib/request";

export type AccountType = "Free" | "Plus" | "ProLite" | "Pro" | "Team";
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";
export type ImageModel = "gpt-image-2" | "codex-gpt-image-2";
export type AuthRole = "admin" | "user";

export type CredentialPreview = {
  present: boolean;
  preview: string;
  length: number;
};

export type Account = {
  id: string;
  access_token: string;
  type: AccountType;
  status: AccountStatus;
  quota: number;
  imageQuotaUnknown?: boolean;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restoreAt?: string | null;
  oauthCredentials?: {
    refreshToken: CredentialPreview;
    idToken: CredentialPreview;
    password: CredentialPreview;
    createdAt?: string | null;
    expiresAt?: string | null;
    chatgptAccountId?: string | null;
    chatgptUserId?: string | null;
  };
  success: number;
  fail: number;
  lastUsedAt: string | null;
  inflightCount?: number;
  maxConcurrency?: number;
  leaseOwner?: string | null;
  leasedUntil?: string | null;
};

type AccountListResponse = {
  items: Account[];
};

type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  removed?: number;
  refreshed?: number;
  errors?: Array<{ access_token: string; error: string }>;
};

type AccountExportResponse = {
  items: Array<Record<string, unknown>>;
  count: number;
};

type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token: string; error: string }>;
};

type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};

export type SettingsConfig = {
  proxy: string;
  base_url?: string;
  allow_user_registration?: boolean;
  new_user_initial_quota?: number | string;
  email_verification_enabled?: boolean;
  email_domain_whitelist_enabled?: boolean;
  email_alias_restriction_enabled?: boolean;
  email_domain_whitelist?: string[];
  smtp_host?: string;
  smtp_port?: number | string;
  smtp_username?: string;
  smtp_password?: string;
  smtp_password_set?: boolean;
  smtp_from_email?: string;
  smtp_use_ssl?: boolean;
  smtp_use_starttls?: boolean;
  smtp_force_auth_login?: boolean;
  linuxdo_oauth_enabled?: boolean;
  linuxdo_client_id?: string;
  linuxdo_client_secret?: string;
  linuxdo_client_secret_set?: boolean;
  linuxdo_minimum_trust_level?: number | string;
  image_model_mappings?: Record<string, string>;
  refresh_account_interval_minute?: number | string;
  image_retention_days?: number | string;
  auto_remove_invalid_accounts?: boolean;
  auto_remove_rate_limited_accounts?: boolean;
  log_levels?: string[];
  [key: string]: unknown;
};

export type ManagedImage = {
  id?: string;
  record_id?: string;
  name: string;
  date: string;
  size: number;
  url: string;
  created_at: string;
  owner_user_id?: string;
  owner_name?: string;
  owner_email?: string;
  prompt?: string;
  mode?: string;
  model?: string;
  image_size?: string;
  channel?: string;
  quota_cost?: number;
};

export type ManagedImageDeleteTarget = {
  id?: string;
  record_id?: string;
  url: string;
};

export type ImageListPagination = {
  page: number;
  page_size: number;
  total: number;
  page_count: number;
};

export type ImageListResponse = {
  items: ManagedImage[];
  groups: Array<{ date: string; items: ManagedImage[] }>;
  pagination: ImageListPagination;
};

export type PromptLibraryItem = {
  id: string;
  title: string;
  description?: string;
  preview?: string;
  reference_image_urls?: string[];
  prompt: string;
  author?: string;
  link?: string;
  mode?: "generate" | "edit" | string;
  image_size?: string;
  image_count?: string;
  icon?: string;
  quick_access?: boolean;
  sort_order?: number;
  category?: string;
  sub_category?: string;
  created?: string;
  updated_at?: string;
};

export type PromptLibraryPayload = {
  title: string;
  description?: string;
  preview?: string;
  reference_image_urls?: string[];
  prompt: string;
  author?: string;
  link?: string;
  mode?: "generate" | "edit" | string;
  image_size?: string;
  image_count?: string;
  icon?: string;
  quick_access?: boolean;
  sort_order?: number | null;
  category?: string;
  sub_category?: string;
};

type PromptLibraryResponse = {
  items: PromptLibraryItem[];
  prompts: PromptLibraryItem[];
  prompt_count: number;
};

export type SystemLog = {
  time: string;
  type: "call" | "account" | "audit" | string;
  summary?: string;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
};

export type LogListResponse = {
  items: SystemLog[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
};

export type ImageResponse = {
  created: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
};

export type LoginResponse = {
  ok: boolean;
  version: string;
  role: AuthRole;
  subject_id: string;
  name: string;
  email?: string;
  quota?: number;
  token?: string;
};

export type CurrentUser = {
  id: string;
  email?: string;
  name: string;
  role: AuthRole;
  status?: "active" | "disabled";
  quota?: number;
  quota_used?: number;
  image_count?: number;
  spent_quota?: number;
  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
};

export type RegisterOptions = {
  allow_user_registration: boolean;
  email_verification_enabled: boolean;
  email_domain_whitelist_enabled: boolean;
  email_alias_restriction_enabled: boolean;
  email_domain_whitelist: string[];
  linuxdo_oauth_enabled: boolean;
  linuxdo_minimum_trust_level: number;
  linuxdo_start_url: string;
  linuxdo_callback_url: string;
};

export type AdminUser = CurrentUser & {
  email: string;
  status: "active" | "disabled";
  quota: number;
  quota_used: number;
};

export type UserKey = {
  id: string;
  name: string;
  role: "user";
  enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
};

export type RegisterConfig = {
  enabled: boolean;
  mail: {
    request_timeout: number;
    wait_timeout: number;
    wait_interval: number;
    providers: Array<Record<string, unknown>>;
  };
  proxy: string;
  total: number;
  threads: number;
  mode: "total" | "quota" | "available";
  target_quota: number;
  target_available: number;
  check_interval: number;
  stats: {
    job_id?: string;
    success: number;
    fail: number;
    done: number;
    running: number;
    threads: number;
    elapsed_seconds?: number;
    avg_seconds?: number;
    success_rate?: number;
    current_quota?: number;
    current_available?: number;
    started_at?: string;
    updated_at?: string;
    finished_at?: string;
  };
  logs?: Array<{
    time: string;
    text: string;
    level: string;
  }>;
};

export async function login(input: string | { email: string; password: string }) {
  if (typeof input === "string") {
    const normalizedAuthKey = String(input || "").trim();
    return httpRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: {},
      headers: {
        Authorization: `Bearer ${normalizedAuthKey}`,
      },
      redirectOnUnauthorized: false,
    });
  }

  return httpRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: input,
    redirectOnUnauthorized: false,
  });
}

export async function fetchRegisterOptions() {
  return httpRequest<RegisterOptions>("/auth/register/options", {
    redirectOnUnauthorized: false,
  });
}

export async function sendRegisterVerificationCode(email: string) {
  return httpRequest<{ ok: boolean; required: boolean }>("/auth/register/email-code", {
    method: "POST",
    body: { email },
    redirectOnUnauthorized: false,
  });
}

export async function registerPersonalUser(payload: { email: string; password: string; name?: string; verification_code?: string }) {
  return httpRequest<{ ok: boolean; user: CurrentUser; token: string }>("/auth/register", {
    method: "POST",
    body: payload,
    redirectOnUnauthorized: false,
  });
}

export async function fetchMe() {
  return httpRequest<{ user: CurrentUser }>("/api/me");
}

export async function updateMyProfile(payload: { name?: string }) {
  return httpRequest<{ user: CurrentUser }>("/api/me/profile", {
    method: "POST",
    body: payload,
  });
}

export async function redeemMyCode(code: string) {
  return httpRequest<{ user: CurrentUser; redeem_code: RedeemCode }>("/api/me/redeem", {
    method: "POST",
    body: { code },
  });
}

export async function fetchAccounts() {
  return httpRequest<AccountListResponse>("/api/accounts");
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function deleteAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { tokens },
  });
}

export async function exportAccounts(tokens: string[]) {
  return httpRequest<AccountExportResponse>("/api/accounts/export", {
    method: "POST",
    body: { tokens },
  });
}

export async function refreshAccounts(accessTokens: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { access_tokens: accessTokens },
  });
}

export async function updateAccount(
  accessToken: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
    max_concurrency?: number;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      access_token: accessToken,
      ...updates,
    },
  });
}

export async function generateImage(prompt: string, model?: ImageModel, size?: string) {
  return httpRequest<ImageResponse>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        ...(model ? { model } : {}),
        ...(size ? { size } : {}),
        n: 1,
        response_format: "b64_json",
      },
    },
  );
}

export async function editImage(files: File | File[], prompt: string, model?: ImageModel, size?: string) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (size) {
    formData.append("size", size);
  }
  formData.append("n", "1");

  return httpRequest<ImageResponse>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function fetchSettingsConfig() {
  return httpRequest<{ config: SettingsConfig }>("/api/settings");
}

export async function updateSettingsConfig(settings: SettingsConfig) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", {
    method: "POST",
    body: settings,
  });
}

export async function fetchManagedImages(filters: {
  start_date?: string;
  end_date?: string;
  user_id?: string;
  channel?: string;
  request_id?: string;
  page?: number;
  page_size?: number;
}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.user_id) params.set("user_id", filters.user_id);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.request_id) params.set("request_id", filters.request_id);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  return httpRequest<ImageListResponse>(`/api/images${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function deleteManagedImages(items: ManagedImageDeleteTarget[]) {
  return httpRequest<{ removed: number; removed_records: number; removed_files: number; ids: string[]; urls: string[] }>(
    "/api/images",
    {
      method: "DELETE",
      body: { items },
    },
  );
}

export async function fetchPromptLibrary() {
  return httpRequest<PromptLibraryResponse>("/api/prompts");
}

export async function fetchAdminPrompts() {
  return httpRequest<PromptLibraryResponse>("/api/admin/prompts");
}

export async function createAdminPrompt(payload: PromptLibraryPayload) {
  return httpRequest<{ item: PromptLibraryItem } & PromptLibraryResponse>("/api/admin/prompts", {
    method: "POST",
    body: payload,
  });
}

export async function updateAdminPrompt(promptId: string, payload: Partial<PromptLibraryPayload>) {
  return httpRequest<{ item: PromptLibraryItem } & PromptLibraryResponse>(`/api/admin/prompts/${promptId}`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteAdminPrompt(promptId: string) {
  return httpRequest<PromptLibraryResponse>(`/api/admin/prompts/${promptId}`, {
    method: "DELETE",
  });
}

export async function uploadPromptExampleImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return httpRequest<{ url: string }>("/api/admin/prompt-assets", {
    method: "POST",
    body: formData,
  });
}

export async function fetchMyImages(filters: {
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  return httpRequest<ImageListResponse>(`/api/me/images${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function fetchSystemLogs(filters: {
  type?: string;
  start_date?: string;
  end_date?: string;
  request_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.request_id) params.set("request_id", filters.request_id);
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  return httpRequest<LogListResponse>(`/api/logs${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function fetchUserKeys() {
  return httpRequest<{ items: UserKey[] }>("/api/auth/users");
}

export async function createUserKey(name: string) {
  return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/auth/users", {
    method: "POST",
    body: { name },
  });
}

export async function updateUserKey(keyId: string, updates: { enabled?: boolean; name?: string }) {
  return httpRequest<{ item: UserKey; items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteUserKey(keyId: string) {
  return httpRequest<{ items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "DELETE",
  });
}

export async function fetchAdminUsers(filters: { query?: string; status?: string; role?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.role) params.set("role", filters.role);
  return httpRequest<{ items: AdminUser[] }>(`/api/admin/users${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function createAdminUser(payload: {
  email: string;
  password: string;
  name?: string;
  quota?: number;
  status?: "active" | "disabled";
}) {
  return httpRequest<{ item: AdminUser; password: string; session_token: string; items: AdminUser[] }>(
    "/api/admin/users",
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function updateAdminUser(
  userId: string,
  payload: { email?: string; name?: string; status?: "active" | "disabled"; quota?: number },
) {
  return httpRequest<{ item: AdminUser; items: AdminUser[] }>(`/api/admin/users/${userId}`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteAdminUser(userId: string) {
  return httpRequest<{ items: AdminUser[] }>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function deleteAdminUsers(userIds: string[]) {
  return httpRequest<{ items: AdminUser[]; removed: number }>("/api/admin/users", {
    method: "DELETE",
    body: { ids: userIds },
  });
}

export async function updateAdminUserQuota(userId: string, payload: { amount: number; mode?: "add" | "set" }) {
  return httpRequest<{ item: AdminUser; items: AdminUser[] }>(`/api/admin/users/${userId}/quota`, {
    method: "POST",
    body: payload,
  });
}

export async function resetAdminUserPassword(userId: string, password?: string) {
  return httpRequest<{ item: AdminUser; password: string }>(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: { password: password || "" },
  });
}

export type RedeemCode = {
  id: string;
  code: string;
  quota: number;
  status: "enabled" | "disabled";
  max_uses: number;
  used_count: number;
  used_by: Array<{ user_id: string; email: string; quota: number; used_at: string }>;
  expires_at?: string | null;
  created_at: string;
  created_by?: string;
  note?: string;
};

export async function fetchRedeemCodes(filters: { query?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  return httpRequest<{ items: RedeemCode[] }>(
    `/api/admin/redeem-codes${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export async function createRedeemCodes(payload: {
  quota: number;
  count: number;
  max_uses?: number;
  expires_at?: string;
  note?: string;
}) {
  return httpRequest<{ items: RedeemCode[]; created: RedeemCode[] }>("/api/admin/redeem-codes/batch", {
    method: "POST",
    body: payload,
  });
}

export async function updateRedeemCode(
  codeId: string,
  payload: { status?: "enabled" | "disabled"; quota?: number; max_uses?: number; expires_at?: string; note?: string },
) {
  return httpRequest<{ item: RedeemCode; items: RedeemCode[] }>(`/api/admin/redeem-codes/${codeId}`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteRedeemCodes(codeIds: string[]) {
  return httpRequest<{ items: RedeemCode[]; removed: number }>("/api/admin/redeem-codes", {
    method: "DELETE",
    body: { ids: codeIds },
  });
}

export type Channel = {
  id: string;
  name: string;
  type: "internal_pool" | "openai_image";
  base_url: string;
  models: string[];
  weight: number;
  priority: number;
  timeout: number;
  enabled: boolean;
  has_api_key: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ModelPricing = {
  model: string;
  enabled: boolean;
  billing_mode: "tokens" | "fixed";
  currency: string;
  input_price_per_million: number;
  output_price_per_million: number;
  model_ratio: number;
  completion_ratio: number;
  model_price: number;
  note: string;
};

export type ModelChannelSummary = {
  id: string;
  name: string;
  type: "internal_pool" | "openai_image" | string;
  enabled: boolean;
  base_url?: string;
  models?: string[];
  model_count?: number;
};

export type ManagedModel = {
  id: string;
  model: string;
  source: "channel" | "custom";
  channel_count: number;
  channels: ModelChannelSummary[];
  enabled: boolean;
  configured: boolean;
  pricing: ModelPricing;
};

export type ModelCatalogResponse = {
  items: ManagedModel[];
  channels: ModelChannelSummary[];
  pricing: Record<string, ModelPricing>;
};

export type ModelPricingPayload = Partial<Omit<ModelPricing, "model">> & {
  model: string;
};

export async function fetchChannels() {
  return httpRequest<{ items: Channel[] }>("/api/admin/channels");
}

export async function createChannel(payload: {
  name: string;
  base_url: string;
  api_key: string;
  models: string[] | string;
  weight: number;
  priority: number;
  timeout: number;
  enabled: boolean;
}) {
  return httpRequest<{ item: Channel; items: Channel[] }>("/api/admin/channels", {
    method: "POST",
    body: payload,
  });
}

export async function updateChannel(
  channelId: string,
  payload: Partial<{
    name: string;
    base_url: string;
    api_key: string;
    models: string[] | string;
    weight: number;
    priority: number;
    timeout: number;
    enabled: boolean;
  }>,
) {
  return httpRequest<{ item: Channel; items: Channel[] }>(`/api/admin/channels/${channelId}`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteChannel(channelId: string) {
  return httpRequest<{ items: Channel[] }>(`/api/admin/channels/${channelId}`, {
    method: "DELETE",
  });
}

export async function fetchModelCatalog() {
  return httpRequest<ModelCatalogResponse>("/api/admin/models");
}

export async function updateModelPricing(payload: ModelPricingPayload) {
  return httpRequest<ModelCatalogResponse & { item: ModelPricing }>("/api/admin/models/pricing", {
    method: "POST",
    body: payload,
  });
}

export async function refreshChannelModels(channelId: string) {
  return httpRequest<ModelCatalogResponse & { channel: Channel; models: string[] }>(
    `/api/admin/channels/${channelId}/models/refresh`,
    { method: "POST" },
  );
}

export async function fetchRegisterConfig() {
  return httpRequest<{ register: RegisterConfig }>("/api/register");
}

export async function updateRegisterConfig(updates: Partial<RegisterConfig>) {
  return httpRequest<{ register: RegisterConfig }>("/api/register", {
    method: "POST",
    body: updates,
  });
}

export async function startRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/start", { method: "POST" });
}

export async function stopRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/stop", { method: "POST" });
}

export async function resetRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/reset", { method: "POST" });
}

// ── CPA (CLIProxyAPI) ──────────────────────────────────────────────

export type CPAPool = {
  id: string;
  name: string;
  base_url: string;
  import_job?: CPAImportJob | null;
};

export type CPARemoteFile = {
  name: string;
  email: string;
};

export type CPAImportJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  direction?: "remote_to_local" | "local_to_remote";
  created_at: string;
  updated_at: string;
  total: number;
  completed: number;
  added: number;
  skipped: number;
  refreshed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
};

export async function fetchCPAPools() {
  return httpRequest<{ pools: CPAPool[] }>("/api/cpa/pools");
}

export async function createCPAPool(pool: { name: string; base_url: string; secret_key: string }) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>("/api/cpa/pools", {
    method: "POST",
    body: pool,
  });
}

export async function updateCPAPool(
  poolId: string,
  updates: { name?: string; base_url?: string; secret_key?: string },
) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteCPAPool(poolId: string) {
  return httpRequest<{ pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "DELETE",
  });
}

export async function fetchCPAPoolFiles(poolId: string) {
  return httpRequest<{ pool_id: string; files: CPARemoteFile[] }>(`/api/cpa/pools/${poolId}/files`);
}

export async function startCPAImport(poolId: string, names: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`, {
    method: "POST",
    body: { names },
  });
}

export async function fetchCPAPoolImportJob(poolId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`);
}

// ── Sub2API ────────────────────────────────────────────────────────

export type Sub2APIServer = {
  id: string;
  name: string;
  base_url: string;
  email: string;
  has_api_key: boolean;
  group_id: string;
  import_job?: CPAImportJob | null;
};

export type Sub2APIRemoteAccount = {
  id: string;
  name: string;
  email: string;
  plan_type: string;
  status: string;
  expires_at: string;
  has_refresh_token: boolean;
};

export type Sub2APIRemoteGroup = {
  id: string;
  name: string;
  description: string;
  platform: string;
  status: string;
  account_count: number;
  active_account_count: number;
};

export async function fetchSub2APIServers() {
  return httpRequest<{ servers: Sub2APIServer[] }>("/api/sub2api/servers");
}

export async function createSub2APIServer(server: {
  name: string;
  base_url: string;
  email: string;
  password: string;
  api_key: string;
  group_id: string;
}) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>("/api/sub2api/servers", {
    method: "POST",
    body: server,
  });
}

export async function updateSub2APIServer(
  serverId: string,
  updates: {
    name?: string;
    base_url?: string;
    email?: string;
    password?: string;
    api_key?: string;
    group_id?: string;
  },
) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "POST",
    body: updates,
  });
}

export async function fetchSub2APIServerGroups(serverId: string) {
  return httpRequest<{ server_id: string; groups: Sub2APIRemoteGroup[] }>(
    `/api/sub2api/servers/${serverId}/groups`,
  );
}

export async function deleteSub2APIServer(serverId: string) {
  return httpRequest<{ servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "DELETE",
  });
}

export async function fetchSub2APIServerAccounts(serverId: string) {
  return httpRequest<{ server_id: string; accounts: Sub2APIRemoteAccount[] }>(
    `/api/sub2api/servers/${serverId}/accounts`,
  );
}

export async function startSub2APIImport(serverId: string, accountIds: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`, {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function startSub2APIExport(serverId: string, localAccountIds: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/export`, {
    method: "POST",
    body: { local_account_ids: localAccountIds },
  });
}

export async function fetchSub2APIImportJob(serverId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`);
}

// ── Upstream proxy ────────────────────────────────────────────────

export type ProxySettings = {
  enabled: boolean;
  url: string;
};

export type ProxyTestResult = {
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
};

export async function fetchProxy() {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy");
}

export async function updateProxy(updates: { enabled?: boolean; url?: string }) {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy", {
    method: "POST",
    body: updates,
  });
}

export async function testProxy(url?: string) {
  return httpRequest<{ result: ProxyTestResult }>("/api/proxy/test", {
    method: "POST",
    body: { url: url ?? "" },
  });
}
