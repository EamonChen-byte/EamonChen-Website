# 陈一铭的个人网站

> 一个运营人的 readme —— 用真心写的个人主页。

## 在线访问

👉 [https://你的用户名.github.io/仓库名](https://你的用户名.github.io/仓库名)

（部署后替换为实际地址）

## 项目简介

这是我的个人主页，包含以下内容板块：

- **关于我** — 个人简介与基本信息
- **专业** — 教育背景与专业技能
- **实习经历** — 5 段实习经历的详细回顾（快手、字节、京东、芒果TV）
- **校园故事** — 研究生会与艺术团经历
- **运营思考** — 可发布/编辑的运营类文章（支持富文本编辑器）
- **生活碎片** — 探店、旅行、演唱会等生活记录
- **联系我** — 联系方式与微信二维码

## 技术栈

- 纯静态 HTML + CSS + JavaScript
- 无框架依赖，单文件部署
- 响应式设计，适配移动端

## 本地预览

```bash
# 使用 Python 简易服务器
python3 -m http.server 8780

# 或使用 Node.js
npx serve .
```

然后访问 http://localhost:8780

## 部署到 GitHub Pages

1. 在 GitHub 创建新仓库（如 `eamon-website`）
2. 将本地代码推送到 GitHub：
   ```bash
   git remote add origin https://github.com/你的用户名/仓库名.git
   git branch -M main
   git push -u origin main
   ```
3. 进入仓库 **Settings → Pages**
4. Source 选择 **Deploy from a branch**
5. Branch 选择 **main**，文件夹选择 **/(root)**
6. 点击 Save，等待几分钟即可访问

## 目录结构

```
.
├── index.html          # 主页面（所有 HTML/CSS/JS）
├── assets/
│   ├── avatar.jpg      # 头像
│   ├── campus/         # 校园故事图片
│   ├── decor/          # 装饰图片
│   ├── jd/             # 京东实习图片
│   ├── jimeng/         # 即梦实习图片
│   ├── kuaishou1/      # 快手实习图片（内容商业生态中心）
│   ├── kuaishou2/      # 快手实习图片（青春娱乐垂类）
│   ├── life/           # 生活碎片图片
│   ├── mango/          # 芒果TV实习图片
│   └── sky-no-limit.mp3 # 背景音乐
└── README.md
```

## 自定义修改

- 修改个人信息：编辑 `index.html` 中对应的文本内容
- 更换图片：替换 `assets/` 下对应文件夹中的图片
- 调整样式：所有 CSS 都在 `index.html` 的 `<style>` 标签内
- 背景音乐：替换 `assets/sky-no-limit.mp3`

## 作者

**陈一铭 (Eamon)**
- 广西大学 · 新闻与传播 · 硕士
- 哈尔滨理工大学 · 软件工程 · 本科
