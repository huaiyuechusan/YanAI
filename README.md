<h1 align="center">颜AI</h1>

<p align="center">颜AI 是一个围绕 ChatGPT 图片能力封装的自托管图片创作与管理系统，提供 OpenAI 兼容图片 API、在线画图工作台、图生图预设、账号池轮询、个人用户额度、渠道管理、模型管理、计费标准配置、图片归档、日志与 Docker 部署能力。</p>

> [!WARNING]
> 免责声明：
>
> 本项目涉及对 ChatGPT 官网文本生成、图片生成与图片编辑等相关接口的逆向研究，仅供个人学习、技术研究与非商业性技术交流使用。
>
> - 严禁将本项目用于任何商业用途、盈利性使用、批量操作、自动化滥用或规模化调用。
> - 严禁将本项目用于破坏市场秩序、恶意竞争、套利倒卖、二次售卖相关服务，以及任何违反 OpenAI 服务条款或当地法律法规的行为。
> - 严禁将本项目用于生成、传播或协助生成违法、暴力、色情、未成年人相关内容，或用于诈骗、欺诈、骚扰等非法或不当用途。
> - 使用者应自行承担全部风险，包括但不限于账号被限制、临时封禁或永久封禁以及因违规使用等所导致的法律责任。
> - 使用本项目即视为你已充分理解并同意本免责声明全部内容；如因滥用、违规或违法使用造成任何后果，均由使用者自行承担。

> [!IMPORTANT]
> 本项目基于对 ChatGPT 官网相关能力的逆向研究实现，存在账号受限、临时封禁或永久封禁的风险。请勿使用你自己的重要账号、常用账号或高价值账号进行测试。

## 快速开始

已发布镜像支持 `linux/amd64` 与 `linux/arm64`，在 x86 服务器和 Apple Silicon / ARM Linux 设备上都会自动拉取匹配架构的版本。

```bash
git clone git@github.com:huaiyuechusan/YanAI.git
cd YanAI
docker build -t your-registry/yanai:latest .
docker push your-registry/yanai:latest
```

当前仓库的 Docker 镜像不会包含 `config.json`、`data/`、`.env`、数据库文件或本地虚拟环境。服务器部署时请通过宿主机挂载提供运行时配置和数据：

```yaml
volumes:
  - ./data:/app/data
  - ./config.json:/app/config.json
```

服务器上准备配置和数据目录：

```bash
cp config.example.json config.json
# 编辑 config.json，将 auth-key 改成你自己的长随机密钥
mkdir -p data
YANAI_IMAGE=your-registry/yanai:latest docker compose up -d
```

也可以用环境变量 `CHATGPT2API_AUTH_KEY` 覆盖 `config.json` 中的 `auth-key`，但不要把真实密钥写进 Dockerfile、镜像构建参数或公开 compose 文件。

本地直接用当前代码启动容器可运行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

本地开发启动
```bash
cd D:\Desktop\颜AI
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

cd D:\Desktop\颜AI\web
npm run dev
```

### 存储后端配置

支持通过环境变量或 `config.json` 中的同名字段切换存储方式；环境变量优先级更高，配置值外层多余引号会自动去除：

- `json` - 本地 JSON 文件（默认）
- `sqlite` - 本地 SQLite 数据库
- `postgres` - 外部 PostgreSQL（需配置 `DATABASE_URL`）
- `git` - Git 私有仓库（需配置 `GIT_REPO_URL` 和 `GIT_TOKEN`）

多人稳定并发部署建议使用 `postgres`。`sqlite` 适合本地开发和轻量验证；`json` / `git` 更适合单实例低并发、备份导入导出或过渡场景，不建议作为多人生产并发的主存储。PostgreSQL 后端启动时会自动检查目标数据库，不存在时会尝试通过 `postgres` / `template1` 维护库创建目标库，并继续自动初始化业务表。

示例：使用 PostgreSQL
```yaml
environment:
  - STORAGE_BACKEND=postgres
  - DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### 反向代理与流式输出

如果通过 Nginx、宝塔、CDN 或平台网关暴露给第三方客户端，建议关闭 SSE 缓冲和压缩，否则客户端可能只看到空消息或等到请求结束才显示：

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    gzip off;
    proxy_set_header Connection "";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    add_header X-Accel-Buffering no always;
    add_header Cache-Control "no-cache, no-transform" always;
}
```

Windows `cmd.exe` 测试流式文本接口时需要转义 JSON 双引号：

```cmd
curl.exe -N "http://127.0.0.1:8000/v1/chat/completions" ^
  -H "Authorization: Bearer <auth-key>" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"gpt-5-5\",\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"
```

### 迁移前保护和审计

从旧 JSON 存储迁移到 SQLite、PostgreSQL 或 Git 前，必须先停写。Docker 部署请先停止 YanAI 容器，确认没有后台任务继续写入 `data/*.json`：

```bash
docker compose stop app
# 如果是按容器名直接管理，也可以使用：docker stop yanai
```

先执行只读审计，确认旧 JSON 数据的数量、重复主键、缺失主键和异常 JSON：

```bash
python scripts/audit_storage.py --data-dir data
```

生成完整 JSON 备份目录，并校验备份可恢复：

```bash
python scripts/backup_storage.py --data-dir data --backup-dir data/backups/pre-migration
python scripts/backup_storage.py --verify data/backups/pre-migration
```

恢复演练可以写到临时目录，避免覆盖生产数据：

```bash
python scripts/backup_storage.py --restore data/backups/pre-migration --target-dir .tmp/restore-check
python scripts/audit_storage.py --data-dir .tmp/restore-check --fail-on-issues
```

迁移脚本支持预演、迁移前备份和只校验模式：

```bash
python scripts/migrate_storage.py --from json --to postgres --dry-run
python scripts/migrate_storage.py --from json --to postgres --backup-dir data/backups/pre-postgres
python scripts/migrate_storage.py --from json --to postgres --verify-only
```

## 功能

### API 兼容能力

- 兼容 `POST /v1/images/generations` 图片生成接口
- 兼容 `POST /v1/images/edits` 图片编辑接口
- 管理员密钥可调用 `POST /v1/chat/completions`、`POST /v1/responses` 与 `POST /v1/messages`
- `POST /v1/chat/completions` 和 `POST /v1/responses` 支持文本流式输出，并兼容 ChatGPT 上游多种 SSE 文本 patch 格式
- 流式接口会返回 `Cache-Control: no-cache, no-transform` 与 `X-Accel-Buffering: no`，便于通过 Nginx 等反向代理接入第三方客户端
- `GET /v1/models` 会返回上游模型列表，并补充内置默认模型 `gpt-5`、`gpt-5-1`、`gpt-5-2`、`gpt-5-3`、`gpt-5-3-mini`、`gpt-5-5`、`gpt-5-mini`、`gpt-image-2`、`codex-gpt-image-2`、`auto`
- 图片接口支持 `n=1-4`，前端工作台会按张数拆分任务执行
- 支持内置账号池与 OpenAI 图片兼容外部渠道，按模型、权重、优先级进行路由
- 支持在渠道管理中关闭内置账号池，仅使用外部 OpenAI 兼容渠道；外部渠道全部失败且内置池关闭时会返回明确的不可用错误
- 支持 Codex 中的画图接口逆向，仅 `Plus` / `Team` / `Pro` 订阅可用，模型别名为 `codex-gpt-image-2`，用于和官网画图区分

### 在线画图功能

- 内置「画图」工作台，支持文生图、图生图和多参考图编辑
- 提供眼镜搭配、发型报告、自然美颜、写真随机风格、照片增强、暗光修复、高清细节修复等预设提示词
- 支持参考图上传、粘贴图片、图片比例选择和多张任务队列
- 提示词输入框支持纵向拉伸，可一键清空已选模板或当前提示词
- 支持复制、分享当前提示词，也可以在历史生成记录中复制或分享当次提示词
- 本地保存图片会话历史，支持回看、删除、清空和从结果图继续编辑
- 服务端可缓存生成图片，并在「图片管理 / 我的图片」中按日期筛选、预览和复制地址
- 「我的图片」支持本页全选、多选、单张下载、所选图片打包下载、批量删除和从选中图片同步到 WebDAV；普通用户只能下载、删除和同步自己的图片记录

### 提示词管理与分享

- 普通用户可在「我的提示词」中创建、编辑、删除个人提示词，并上传提示词示例图
- 用户可将个人提示词提交给管理员审核；管理员可在「提示词管理」中查看待审核内容，通过后加入公共提示词库，或填写原因驳回
- 支持为当前提示词、历史提示词或提示词库条目生成分享链接；其他用户可通过分享链接预览并导入到个人提示词库，管理员也可导入为公共提示词
- 画图工作台的提示词库会合并公共提示词和当前用户可见的个人提示词，便于直接套用常用模板

### 号池管理功能

- 自动刷新账号邮箱、类型、额度和恢复时间
- 轮询可用账号执行图片生成与图片编辑
- 遇到 Token 失效类错误时自动剔除无效 Token
- 按设置页「账号刷新间隔」定时刷新全部账号信息、额度和恢复时间
- 文本调用会跳过 `禁用`、`限流`、`异常` 账号，避免选中不可用账号导致空输出
- 支持网页端配置全局 HTTP / HTTPS / SOCKS5 / SOCKS5H 代理
- 支持搜索、筛选、批量刷新、导出、手动编辑和清理账号
- 支持四种导入方式：本地 CPA JSON 文件导入、远程 CPA 服务器导入、`sub2api` 服务器导入、`access_token` 导入
- 支持在设置页配置 `sub2api` 服务器，筛选并批量导入其中的 OpenAI OAuth 账号

### 管理台功能

- 管理员可创建个人用户、调整额度、禁用账号、重置密码
- 支持个人用户注册、登录、兑换码领取额度，以及个人图片记录查看
- 普通用户配置有效个人生图渠道后，即使本地图片额度为 0 也可使用该个人渠道；个人渠道失败时不会免费回落到内置账号池
- 支持兑换码批量生成、筛选、复制、批量删除和导出所选兑换码
- 支持 OpenAI 图片兼容渠道管理，可新增、编辑、启停和删除渠道，并设置 Base URL、API Key、模型、权重、优先级和超时时间
- 外部渠道 Base URL 兼容填写根地址或已带 `/v1` 的地址，图片生成、图片编辑和模型列表请求会自动规范化 OpenAI 兼容路径，避免重复拼接 `/v1`
- 渠道管理支持选择模型后测试渠道 `/v1/models` 可用性，显示通过模型、缺失模型、错误信息和延迟；测试不会覆盖渠道已配置模型
- 对不支持 `GET /v1/models` 的外部渠道，渠道测试会提示该接口不可用，并允许保存渠道后直接按已配置模型生图
- 内置账号池也作为渠道展示，可在管理台中单独启停，方便纯外部渠道部署或临时停用本地账号池
- 支持模型管理，可按渠道汇总模型、从渠道 `/v1/models` 获取模型列表，并为每个模型配置计费标准
- 支持系统日志、调用日志和审计日志查看，可按类型、状态、日期、请求 ID、用户邮箱 / 昵称 / ID 或令牌信息筛选
- 支持图片访问地址配置、自动清理天数、账号刷新间隔和模型映射配置

### 图片归档与 WebDAV

- 管理员可在「图片管理」中配置全局 WebDAV 存储，普通用户可在「我的图片」中配置自己的 WebDAV 目录
- WebDAV 支持启停、URL、用户名、密码和远程目录配置；密码会以已设置状态回显，编辑时留空可保持原密码
- 新生成图片在 WebDAV 启用后会自动尝试同步；也可按日期、用户、渠道或请求 ID 手动同步历史图片
- 管理员和普通用户都可以先勾选图片，再只同步所选图片到 WebDAV；未选择图片时仍按当前筛选范围同步
- 图片记录会保存 WebDAV 同步状态、同步时间和远程地址，图片管理与我的图片页面会显示已同步状态

### 模型管理与计费标准

- 管理员可在「模型管理」页面查看所有渠道模型；内置账号池默认提供与 New API 接入常用配置一致的 10 个模型，外部渠道则读取渠道自身 `models` 配置。
- 每个 OpenAI 兼容外部渠道都可以通过「获取」按钮请求该渠道的 `/v1/models`，成功后自动写回渠道模型列表。
- 模型计费配置保存在系统配置 `model_pricing` 中，兼容 JSON、SQLite、PostgreSQL 等现有存储后端，不需要额外迁移表结构。
- 计费标准支持按 Token 和按次两种模式；可配置输入价 / 1M tokens、输出价 / 1M tokens、`model_ratio`、`completion_ratio`、`model_price`、币种和启停状态，方便对接 New API 风格的倍率或固定价格计费。

### 多用户稳定并发改造

当前仓库已经完成多用户稳定并发改造，核心依赖数据库事务、行级写入、租约和请求追踪。

- 存储层拆分为 Repository 边界，并保留兼容旧 Storage API 的适配器；数据库后端覆盖账号、管理员密钥、用户、会话、兑换码、渠道、提示词库、图片记录、额度预留、系统配置、系统日志和审计日志等数据集
- SQLite / PostgreSQL 后端初始化时会自动创建所需业务表，降低首次部署和迁移后的手动建表成本
- PostgreSQL 存储配置可放在环境变量或 `config.json` 中，环境变量优先；目标数据库不存在时会自动创建，减少首次部署和远程库迁移时的手动准备工作
- 数据迁移和安全保护覆盖完整业务数据，提供只读审计、备份恢复、迁移预演、迁移校验和重复主键检查，支持从旧 JSON 数据迁移到 SQLite / PostgreSQL；迁移范围包含账号、密钥、用户、会话、兑换码、渠道、提示词库、图片记录、额度预留、系统设置、系统日志和审计日志
- 普通用户图片额度改为请求级预扣：任务开始前按 `request_id` 预留额度，成功后按实际生成数量确认，失败或无结果时释放，过期预留由后台 watcher 返还；管理员调用不占用个人额度
- 有效个人生图渠道会跳过本地额度预扣，图片记录的 `quota_cost` 记为 0；若该个人渠道配置错误、模型不匹配或上游调用失败，请求直接返回个人渠道错误，不会继续使用内置账号池
- 账号池改为图片任务租约模型，支持 `max_concurrency`、`inflight_count`、`lease_owner`、`lease_owners` 和 `leased_until`，租用成功后再调用上游，结束时释放并更新成功、失败、额度和限流状态；PostgreSQL 下会使用行级锁避免多个任务抢占同一账号
- 后台 `account-refresh-watcher` 会按配置间隔刷新全部账号，便于同步邮箱、类型、额度、恢复时间和状态；`quota-reservation-watcher` 会继续释放过期额度预留
- 图片记录改为逐条插入并使用 UUID 记录 ID，支持按用户、日期、渠道和 `request_id` 分页查询，避免多人同时生成图片时整表覆盖导致记录丢失
- 兑换码兑换、渠道更新、提示词新增和系统设置已接入数据库 Repository：单次兑换码并发兑换只能成功一次，不同渠道或提示词的并发管理操作不会互相覆盖
- 请求链路加入 `x-request-id` / `request_id`，贯穿 API 调用、额度预留、账号租约、图片记录、系统日志和审计日志；`/api/storage/info` 和健康检查可查看当前存储后端与数据集状态

### 注册机邮箱 Provider

注册机支持在 `/register` 页面配置多个临时邮箱 provider，并按启用顺序轮换。`moemail` 配置示例：

```json
{
  "enable": true,
  "type": "moemail",
  "api_base": "https://moemail.app",
  "api_key": "YOUR_MOEMAIL_API_KEY",
  "default_domain": "moemail.app",
  "expiry_time": 3600000
}
```

`api_base` 可以改为你自部署的 MoeMail 地址；`expiry_time` 单位为毫秒，`3600000` 表示 1 小时。

### 实验性 / 注意事项

- 文本类兼容接口主要面向管理员密钥和调试场景，个人用户仅开放图片相关能力
- 流式图片与文本输出仍建议谨慎测试
- 详细状态说明见：[功能清单](./docs/feature-status.en.md)

## 截图

### 画图功能
![image-20260604221114171](README.assets/image-20260604221114171.png)

### 用户管理
![image-20260604221129930](README.assets/image-20260604221129930.png)

### 账号池管理（添加RT的获取）
![image-20260604221249125](README.assets/image-20260604221249125.png)

### 注册机管理
![image-20260604221336677](README.assets/image-20260604221336677.png)

### 提示词管理
![image-20260604221403230](README.assets/image-20260604221403230.png)

### 图片管理

![image-20260604221416836](README.assets/image-20260604221416836.png)

### 渠道管理（在原有项目基础上添加第三方渠道）
![image-20260604221426835](README.assets/image-20260604221426835.png)

### 模型管理（可作为渠道接入newapi）

![image-20260604221442002](README.assets/image-20260604221442002.png)

### 兑换码管理

![image-20260604221532803](README.assets/image-20260604221532803.png)

### 用户登录注册功能（添加L站登录和邮箱验证）
![image-20260604221546536](README.assets/image-20260604221546536.png)

## API

所有 AI 接口都需要请求头：

```http
Authorization: Bearer <auth-key>
```

<details>
<summary><code>GET /v1/models</code></summary>
<br>

返回上游模型列表，并补充当前内置默认模型。

```bash
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer <auth-key>"
```

<details>
<summary>说明</summary>
<br>

| 字段   | 说明                                                                                                                                 |
|:-----|:-----------------------------------------------------------------------------------------------------------------------------------|
| 返回模型 | 上游模型列表，并补充 `gpt-5`、`gpt-5-1`、`gpt-5-2`、`gpt-5-3`、`gpt-5-3-mini`、`gpt-5-5`、`gpt-5-mini`、`gpt-image-2`、`codex-gpt-image-2`、`auto` |
| 接入场景 | 可接入 Cherry Studio、New API 等上游或客户端                                                                                                  |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/images/generations</code></summary>
<br>

OpenAI 兼容图片生成接口，用于文生图。

```bash
curl http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一只漂浮在太空里的猫",
    "n": 1,
    "response_format": "b64_json"
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段                | 说明                                                 |
|:------------------|:---------------------------------------------------|
| `model`           | 图片模型，当前可用值以 `/v1/models` 返回结果为准，推荐使用 `gpt-image-2` |
| `prompt`          | 图片生成提示词                                            |
| `n`               | 生成数量，当前后端限制为 `1-4`                                 |
| `response_format` | 当前请求模型中包含该字段，默认值为 `b64_json`                       |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/images/edits</code></summary>
<br>

OpenAI 兼容图片编辑接口，用于上传图片并生成编辑结果。

```bash
curl http://localhost:8000/v1/images/edits \
  -H "Authorization: Bearer <auth-key>" \
  -F "model=gpt-image-2" \
  -F "prompt=把这张图改成赛博朋克夜景风格" \
  -F "n=1" \
  -F "image=@./input.png"
```

<details>
<summary>字段说明</summary>
<br>

| 字段       | 说明                                  |
|:---------|:------------------------------------|
| `model`  | 图片模型， `gpt-image-2`                 |
| `prompt` | 图片编辑提示词                             |
| `n`      | 生成数量，当前后端限制为 `1-4`                  |
| `image`  | 需要编辑的图片文件，使用 multipart/form-data 上传 |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/chat/completions</code></summary>
<br>

Chat Completions 兼容接口。文本模型会走 ChatGPT 文本对话链路；图片模型或 `modalities` 包含 `image` 时会走图片工作流。

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-5-5",
    "messages": [
      {
        "role": "user",
        "content": "你好，请简单介绍一下你自己"
      }
    ],
    "stream": true
  }'
```

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-image-2",
    "messages": [
      {
        "role": "user",
        "content": "生成一张雨夜东京街头的赛博朋克猫"
      }
    ],
    "n": 1
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段         | 说明                |
|:-----------|:------------------|
| `model`    | 文本模型走文本对话链路；`gpt-image-2` / `codex-gpt-image-2` 走图片链路 |
| `messages` | OpenAI Chat Completions 消息数组 |
| `prompt`   | 兼容字段；未传 `messages` 时可作为用户输入 |
| `n`        | 图片链路生成数量，当前后端限制为 `1-4` |
| `stream`   | 支持流式输出；反向代理需关闭缓冲 |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/responses</code></summary>
<br>

Responses API 兼容接口。未传 `image_generation` 工具时走文本输出；传入图片生成工具时走图片工作流。

```bash
curl http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-5",
    "input": "你好，请简单介绍一下你自己",
    "stream": true
  }'
```

```bash
curl http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-5",
    "input": "生成一张未来感城市天际线图片",
    "tools": [
      {
        "type": "image_generation"
      }
    ]
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段       | 说明                            |
|:---------|:------------------------------|
| `model`  | 文本链路按传入模型调用；图片工具链路会回显该模型字段 |
| `input`  | 文本输入或 Responses 消息数组；图片工具链路需要能解析出图片生成提示词 |
| `instructions` | 可选系统指令，会合并到文本链路消息中 |
| `tools`  | 包含 `image_generation` 时触发图片生成工具调用 |
| `stream` | 支持流式输出；反向代理需关闭缓冲 |

<br>
</details>
</details>

## ToDoList

- [x] 择默认提示词模板后，没法再次点击取消，添加一键清空模板按钮
- [x] 提示词框可以自由拉伸的
- [x] 提示词分享和用户导入，每个用户也能单独管理自己的提示词
- [x] 用户端设置自己api
- [x] 页面卡顿：因为网站仍然把大图用 base64 直接塞进页面里。这需要改网站代码或后端接口：改成图片 URL + 缩略图 + 原图懒加载
- [x] 兑换码批量导出
- [ ] 接入支付功能
- [x] pg构建知识库自动建表
- [x] 自定义渠道没有余额，额度显示0
- [x] 日志按用户查找
- [x] webdav配置保存图片
- [x] 用户管理自己生成的照片，支持选择、下载、打包下载、删除和所选 WebDAV 同步
- [x] 渠道模型可用性测试，可选择模型并查看缺失模型和延迟
- [x] 自定义渠道 Base URL 兼容根地址和 `/v1` 地址，并优化不支持模型列表接口时的错误提示
- [x] postgres数据库环境从config读取配置，所有json数据迁移到postgres（含额度预留、系统设置、系统日志和审计日志）

## 社区支持

学 AI , 上 L 站：[LinuxDO](https://linux.do)

## 致谢

感谢佬友的 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 项目在 ChatGPT 逆向整理、OpenAI 兼容接口封装和自托管部署思路上的探索与开源分享。颜AI 的项目方向与部分实现思路受其启发。<br>
感谢佬友的[贴一个让设计师也觉得脊背发凉的提示词 ](https://linux.do/t/topic/532495)<br>
感谢佬友的 [🍌Banana Prompt Quicker](https://linux.do/t/topic/1244563)项目在提示词快捷工作流上的开源分享与启发。<br>

## Contributors

感谢所有为本项目做出贡献的开发者：

<a href="https://github.com/huaiyuechusan/YanAI/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=huaiyuechusan/YanAI" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=huaiyuechusan/YanAI&type=date&legend=top-left)](https://www.star-history.com/?repos=huaiyuechusan%2FYanAI&type=date&legend=top-left)
