# 🚀 AI 学习助手 — Railway 免费部署教程

## 你需要准备

- GitHub 账号
- Railway 账号（用 GitHub 登录 [railway.app](https://railway.app)）
- DeepSeek API Key
- OpenAI API Key（用于 embedding，新注册送 $5 额度）

> 💰 每月 $5 免费额度，个人使用完全够。

---

## 第一步：推代码到 GitHub

```bash
cd "C:\Users\。。。\Documents\Codex\2026-06-23\be\AI学习助手"

git init
git add .
git commit -m "准备 Railway 部署"
git remote add origin https://github.com/你的用户名/ai-learning-assistant.git
git branch -M main
git push -u origin main
```

---

## 第二步：在 Railway 部署

1. 打开 https://railway.app → 用 GitHub 登录
2. 点 **New Project** → **Deploy from GitHub repo**
3. 选择 `ai-learning-assistant` 仓库
4. Railway 会自动检测根目录的 `Dockerfile` 并开始构建

---

## 第三步：设置环境变量

等构建完成后，点进你的项目 → **Variables**，添加以下变量：

| 变量名 | 值 |
|--------|-----|
| `FLASK_ENV` | `production` |
| `SECRET_KEY` | 随便打一串乱码 |
| `LLM_API_KEY` | `你的-deepseek-api-key` |
| `LLM_API_BASE` | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | `deepseek-chat` |
| `EMBEDDING_API_KEY` | `你的-openai-api-key` |
| `EMBEDDING_API_BASE` | `https://api.openai.com/v1` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` |
| `CHROMA_PERSIST_DIR` | `/app/chroma_data` |

添加完后 Railway 会自动重新部署。

---

## 第四步：访问

部署完成后，点 **Settings** → 你会看到类似 `xxx.up.railway.app` 的域名。

打开它，AI 学习助手就上线了！🎉

---

## 可选：绑定自定义域名

Railway Settings → Domains → Custom Domain → 添加你自己的域名，配置 CNAME 指向 `xxx.up.railway.app`。

---

## 注意事项

- **免费额度**：每月 $5，够一台 512MB 实例跑满一整个月
- **项目地址**：`C:\Users\。。。\Documents\Codex\2026-06-23\be\AI学习助手\`
- **数据库**：用 SQLite，数据在实例重启后会保留（重新部署会丢失）
- 如果需要更新代码，`git push` 后 Railway 自动重新构建部署
