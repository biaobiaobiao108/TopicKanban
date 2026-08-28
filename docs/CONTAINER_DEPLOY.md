# 本地 Podman / Docker 容器部署与反向代理配置指南

本文档介绍如何在本地服务器、家庭 NAS（群晖/绿联/极空间）或 VPS 上通过 **Podman** 或 **Docker** 容器化部署「叙事类视频选题生产工作台」，并配置反向代理（Nginx / Caddy / Cloudflare Tunnel / NPM）。

---

## 🚀 一、快速开始

### 方式 1：Docker Compose / Podman Compose（推荐）

1. **准备配置文件**：
   在项目根目录下配置 `docker-compose.yml` 或新建运行目录：

   ```yaml
   services:
     kanban:
       image: topic-kanban:latest
       build:
         context: .
         dockerfile: Dockerfile
       container_name: topic-kanban
       restart: unless-stopped
       ports:
         - "3030:3030"
       environment:
         - NODE_ENV=production
         - PORT=3030
         - APP_PASSWORD=your_secure_password      # 工作台访问密码
         - QUICK_DROP_TOKEN=your_quick_drop_token  # 手机快捷指令快投Token
         - PUBLIC_BASE_URL=https://kanban.yourdomain.com # 反向代理公网域名 (若无反代可留空)
         - DATA_DIR=/app/data
       volumes:
         - ./data:/app/data
   ```

2. **一键启动**：
   - **Docker**：
     ```bash
     docker compose up -d --build
     ```
   - **Podman**：
     ```bash
     podman-compose up -d --build
     # 或使用 podman compose
     podman compose up -d --build
     ```

3. **访问工作台**：
   打开浏览器访问 `http://localhost:3030` 或 `http://服务器IP:3030`。

---

### 方式 2：纯 CLI 命令行运行

#### 使用 Podman：
```bash
# 1. 构建镜像
podman build -t topic-kanban:latest .

# 2. 运行容器 (持久化数据保存在当前目录下的 data 目录)
podman run -d \
  --name topic-kanban \
  --restart unless-stopped \
  -p 3030:3030 \
  -e APP_PASSWORD="your_secure_password" \
  -e QUICK_DROP_TOKEN="your_quick_drop_token" \
  -e PUBLIC_BASE_URL="https://kanban.yourdomain.com" \
  -v ./data:/app/data:Z \
  topic-kanban:latest
```
> **提示**：Podman 在启用了 SELinux 的系统（如 Fedora/RHEL/CentOS）上挂载卷时，建议加上 `:Z` 参数。

#### 使用 Docker：
```bash
# 1. 构建镜像
docker build -t topic-kanban:latest .

# 2. 运行容器
docker run -d \
  --name topic-kanban \
  --restart unless-stopped \
  -p 3030:3030 \
  -e APP_PASSWORD="your_secure_password" \
  -e QUICK_DROP_TOKEN="your_quick_drop_token" \
  -e PUBLIC_BASE_URL="https://kanban.yourdomain.com" \
  -v ./data:/app/data \
  topic-kanban:latest
```

---

## 🌐 二、反向代理（Reverse Proxy）配置样例

为了实现外网 HTTPS 安全访问、免登录外部审稿链接及手机快捷指令随时随地投递灵感，建议使用反向代理。

### 1. Nginx 配置样例

```nginx
server {
    listen 80;
    server_name kanban.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name kanban.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 10M; # 允许大草稿与备份导入

    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # WebSocket / KeepAlive 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 2. Caddy 配置样例

```caddyfile
kanban.yourdomain.com {
    reverse_proxy 127.0.0.1:3030 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

### 3. Nginx Proxy Manager (NPM) 图形化配置

1. 新增 Proxy Host：
   - **Domain Names**: `kanban.yourdomain.com`
   - **Forward Scheme**: `http`
   - **Forward Hostname / IP**: `127.0.0.1`（或容器内部服务名）
   - **Forward Port**: `3030`
   - 勾选 `Block Common Exploits`、`Websockets Support`。
2. 在 SSL 标签页中申请 Let's Encrypt 证书并勾选 `Force SSL` 与 `HTTP/2 Support`。

---

## ⚙️ 三、环境变量参考

| 环境变量 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `PORT` | 否 | `3030` | 容器内 HTTP 监听端口 |
| `DATA_DIR` | 否 | `/app/data` | 数据持久化目录（存放 `kanban.db`） |
| `APP_PASSWORD` | 建议 | 空 | 工作台访问密码 |
| `QUICK_DROP_TOKEN` | 建议 | 空 | 手机/快捷指令灵感快投独立鉴权 Token |
| `PUBLIC_BASE_URL` | 否 | 空 | 反向代理的公网基准域名（**必须包含协议头**，例如 `https://kanban.example.com`） |

> **提示**：
> 1. `PUBLIC_BASE_URL` **必须包含完整的 `https://` 或 `http://` 协议前缀**（切勿填成裸域名 `kanban.example.com`），否则浏览器会将其误判为相对路径导致审稿外链跳转失效。
> 2. `PUBLIC_BASE_URL` 也可以在进入工作台后，在**「偏好设置」->「选题生产流与外部审稿偏好」**中直接图形化填写和修改。

---

## 🗄️ 四、数据备份与迁移

- **本地持久化文件**：所有数据（选题、事实材料、时间线、人物档案网、文案草稿、审稿快照、快投灵感、设置）全部存储在挂载卷的 `./data/kanban.db` 单个 SQLite 文件中。
- **备份方式 1（文件复制）**：直接备份宿主机上的 `./data/kanban.db`。
- **备份方式 2（图形化 JSON 导出）**：在工作台「偏好设置」页面点击「导出全量 JSON 备份」，随时可以在任意新部署的环境中一键恢复。
