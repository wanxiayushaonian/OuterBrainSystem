# Nexus - 外脑思维链路管理系统

基于 COP 模型（Capture → Orchestrate → Produce）的认知伙伴，让思考可见、可塑、可延伸。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Vite + TypeScript |
| 后端 | FastAPI + Python 3.11+ |
| 数据库 | SQLite (aiosqlite) |
| AI | Anthropic SDK (Claude API) |
| 配置 | Hydra + OmegaConf |

## 快速启动

### 前置条件

- **Node.js** >= 18
- **Python** >= 3.11
- **uv** (Python 包管理器) — [安装方式](https://docs.astral.sh/uv/getting-started/installation/)

### 1. 克隆仓库

```bash
git clone git@github.com:wanxiayushaonian/OuterBrainSystem.git
cd OuterBrainSystem
```

### 2. 配置后端环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，填入你的 API Key：

```env
# Anthropic API Key (支持 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN)
ANTHROPIC_AUTH_TOKEN=your-api-key-here

# 第三方 Anthropic 兼容 API 地址 (留空使用官方 API)
ANTHROPIC_BASE_URL=https://your-proxy.com/anthropic

# 模型名称 (可选，覆盖 config.yaml)
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### 3. 安装后端依赖

```bash
cd backend
uv sync
cd ..
```

### 4. 安装前端依赖

```bash
npm install
```

### 5. 启动服务

**启动后端** (终端 1)：

```bash
cd backend
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

**启动前端** (终端 2)：

```bash
npm run dev
```

### 6. 访问应用

打开浏览器访问 **http://localhost:5173**

## 项目结构

```
OuterBrainSystem/
├── backend/
│   ├── src/
│   │   ├── agents/           # AI Agent 系统 (7 个 Agent)
│   │   │   ├── base_agent.py
│   │   │   ├── distillation_agent.py    # 提炼 Agent
│   │   │   ├── socratic_agent.py        # 苏格拉底质疑 Agent
│   │   │   ├── flow_analyzer_agent.py   # 流程分析 Agent
│   │   │   ├── conclusion_agent.py      # 结论生成 Agent
│   │   │   ├── relation_discoverer.py   # 关系发现 Agent
│   │   │   ├── cognitive_debate_agent.py # 认知辩论 Agent
│   │   │   └── research_path_agent.py   # 研究路径 Agent
│   │   ├── api/              # API 路由
│   │   │   ├── chat.py       # 聊天流式接口
│   │   │   └── sessions.py   # 会话管理接口
│   │   ├── core/             # 核心模块
│   │   │   ├── agent_router.py    # Agent 路由器
│   │   │   ├── agent_types.py     # Agent 类型定义
│   │   │   ├── runtime/           # 运行时抽象
│   │   │   ├── session/           # 会话持久化
│   │   │   └── tools/             # 工具注册系统
│   │   ├── llm/              # LLM 客户端
│   │   │   ├── client.py     # Anthropic SDK 封装 + L3 工具执行
│   │   │   └── router.py     # 旧版路由 (兼容)
│   │   ├── providers/        # Provider 实现
│   │   │   └── anthropic/
│   │   │       ├── l2_tools.py   # L2 复合工具
│   │   │       └── l3_tools.py   # L3 Agent 工具
│   │   └── main.py           # FastAPI 入口
│   ├── run/conf/config.yaml  # 后端配置
│   └── pyproject.toml        # Python 依赖
├── frontend/
│   ├── src/
│   │   ├── core/             # 核心模块 (runtime, session, types)
│   │   ├── features/         # 功能模块
│   │   │   ├── canvas/       # 无限画布 (渲染、交互、布局)
│   │   │   ├── chat/         # AI 聊天面板
│   │   │   ├── capture/      # 捕捉功能
│   │   │   └── inbox/        # 收件箱 + 大纲
│   │   ├── shared/           # 共享组件和工具
│   │   └── styles/           # CSS 样式
│   └── index.html            # 前端入口
├── vite.config.ts            # Vite 配置 (含 API 代理)
├── package.json              # 前端依赖
└── plan/                     # 开发路线图
```

## Agent 系统

Nexus 内置 7 个 AI Agent，通过 L3 工具供 LLM 调用：

| Agent | 工具名 | 功能 |
|-------|--------|------|
| Distillation Agent | `distill_text` | 提炼对话为精华卡片 + 关键词 |
| Socratic Agent | `challenge_thinking` | 苏格拉底式质疑，发现逻辑漏洞 |
| Flow Analyzer | `analyze_flow` | 分析思维结构，检测孤立/瓶颈 |
| Conclusion Agent | `synthesize_cards` | 综合多张卡片为结论 |
| Relation Discoverer | `discover_relations` | 扫描画布发现潜在关联 |
| Cognitive Debate | `debate_mode` | 正反方辩论分析 |
| Research Path | `research_path` | 生成研究路径简报 |

## 核心功能

- **无限画布**: 自由拖拽、缩放、平移的思维画布
- **卡片系统**: 7 种卡片类型 (note, distillation, socratic, flow_analysis, choice, vote, conclusion)
- **连线关系**: 5 种关系标签 (supports, contradicts, extends, questions, relates)
- **分组管理**: 卡片分组、折叠/展开、锁定/解锁
- **AI 聊天**: 流式对话 + 工具调用 + 会话持久化
- **Markdown 渲染**: 实时流式渲染标题、加粗、表格、代码块

## 配置说明

后端配置文件: `backend/run/conf/config.yaml`

```yaml
server:
  host: "0.0.0.0"
  port: 8000
  cors_origins: ["http://localhost:5173"]

llm:
  model: "mimo-v2.5-pro"     # 默认模型
  max_tokens: 1024
  temperature: 0.7
  flow:
    model: "mimo-v2.5-pro"   # 聊天模型
    max_tokens: 2048
    temperature: 0.7
```

环境变量优先级: `ANTHROPIC_MODEL` > `config.yaml` > 代码默认值

## 开发命令

```bash
# 后端
cd backend
uv run uvicorn src.main:app --reload          # 启动开发服务器
uv run pytest                                  # 运行测试
uv run ruff check .                            # 代码检查

# 前端
npm run dev                                    # 启动开发服务器
npm run build                                  # 构建生产版本
```

## 生产部署

### 前置条件

- **Docker** >= 24
- **Docker Compose** >= 2.20

### 1. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# 必填 — 访问密码（登录页面使用）
NEXUS_API_TOKEN=your-secret-token

# 可选 — Anthropic API 配置
ANTHROPIC_AUTH_TOKEN=your-api-key
ANTHROPIC_BASE_URL=https://your-proxy.com/anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# 可选 — CORS 允许的域名（逗号分隔，留空允许所有）
NEXUS_CORS_ORIGINS=https://your-domain.com

# 可选 — 端口映射（默认 8000）
NEXUS_PORT=8000
```

### 2. 构建并启动

```bash
docker compose build
docker compose up -d
```

启动后访问 **http://your-server:8000**，输入 `NEXUS_API_TOKEN` 中设置的密码登录。

### 3. 常用命令

```bash
docker compose up -d          # 后台启动
docker compose down            # 停止
docker compose logs -f         # 查看日志
docker compose restart         # 重启
```

### 4. 数据持久化

SQLite 数据库存储在 Docker volume `nexus-data` 中，映射到容器内 `/data/nexus.db`。`docker compose down` 不会丢失数据，`docker compose down -v` 会删除数据。

### 5. 反向代理（推荐）

建议使用 Nginx/Caddy 做反向代理，配置 HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 支持（AI 聊天流式响应）
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

### 6. 安全说明

- **认证**: 未设置 `NEXUS_API_TOKEN` 时不启用认证（仅限本地开发）
- **速率限制**: LLM 端点 10 req/min，其他 API 端点 30 req/min
- **CORS**: 生产环境通过 `NEXUS_CORS_ORIGINS` 配置允许的域名
- **错误信息**: 生产环境不暴露内部错误细节
- **Prompt 注入**: 用户内容经过 HTML 转义后传入 LLM

## License

Private project.
