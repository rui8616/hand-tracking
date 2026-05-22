# 部署 + Demo 录制指南

## 部署 Live Demo

项目是纯静态 SPA，可以部署到任何静态主机。三个推荐方案，按上手速度排序。

### 方案 1：Vercel（推荐，最快）

1. 把代码 push 到 GitHub
2. 打开 https://vercel.com/new 用 GitHub 账号登录
3. 选你的仓库 → **Framework Preset 选 "Vite"** → Deploy
4. 1-2 分钟后拿到 `https://gesture-xxx.vercel.app` URL
5. 在 Vercel 项目设置里可绑定自定义域名

**注意**：摄像头需要 HTTPS，Vercel 默认就给 HTTPS，免配置。

### 方案 2：Netlify

1. https://app.netlify.com/start
2. 连接 GitHub，选仓库
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

### 方案 3：GitHub Pages

```bash
# 1. 在 vite.config.ts 加 base 路径（仓库名）
# export default defineConfig({ base: '/gesture/', ... })

# 2. 构建
npm run build

# 3. 部署 dist/ 到 gh-pages 分支
npm install -D gh-pages
npx gh-pages -d dist
```

然后在 GitHub 仓库的 Settings → Pages 把 source 设为 `gh-pages` 分支。

或者用 GitHub Actions 自动化部署（推荐）。把以下文件放到 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## 录制 Demo GIF

GIF 是 README 的核心视觉资产，决定招聘者要不要看下去。**值得花时间录好**。

### 录什么

一段 6-10 秒的循环 GIF，依次展示：
1. 手伸到画面里 → 3D 骨骼跟随（1-2 秒）
2. 摆出「指点」姿势 → 粒子开始汇聚（2-3 秒）
3. 蓄满后甩出食指 → 光束发射 + 拖尾（2-3 秒）

### 录制方法

**macOS**：
- `Cmd + Shift + 5` 选「录制选定部分」→ 录 mov
- 再用 ffmpeg 或在线工具 [ezgif.com](https://ezgif.com/) 转 GIF

ffmpeg 转换命令（推荐高质量两步法）：
```bash
ffmpeg -i input.mov -vf "fps=15,scale=960:-1:flags=lanczos,palettegen" -y palette.png
ffmpeg -i input.mov -i palette.png -filter_complex "fps=15,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse" -y demo.gif
```

**目标**：GIF 文件 < 5MB，分辨率 960px 宽，15 fps。

### 录制小技巧

- **光线充足**：手要清晰可见，否则骨骼会抖
- **背景纯色**：减少视觉干扰，突出 3D 场景
- **录两段后期合成**：一段录手、一段录屏幕，叠放显示「输入 + 输出」（更专业）
- **保留状态文字**：左上角的「能量已汇聚」等文字是产品语言
- **不要录到摄像头预览里的真人脸**：右下角小窗可以遮一下

### 放到 README

录好后：

```bash
mkdir -p docs/media
cp demo.gif docs/media/
```

然后在 `README.md` 里取消下面这行的注释：
```markdown
![demo](./docs/media/demo.gif)
```

---

## 提交到 GitHub 的清单

部署前过一遍：

- [ ] `npm run build` 通过
- [ ] `npx tsc --noEmit` 无错
- [ ] `README.md` 顶部的 `<your-handle>` 占位替换为真实 GitHub 用户名
- [ ] `LICENSE` 里 `<your-name>` 替换为真实姓名
- [ ] `docs/media/demo.gif` 已上传（< 5MB）
- [ ] README 的 live demo URL 替换为真实部署地址
- [ ] 删除 `dist/` 和 `node_modules/`（`.gitignore` 已配置）
- [ ] 个人 GitHub 仓库描述写好，加 topics：`hand-tracking`、`mediapipe`、`threejs`、`gesture-recognition`、`webgl`、`typescript`

---

## 让简历招聘者看到

部署 + 录 GIF 之后，下面这些渠道值得发：

| 渠道 | 节奏 | 内容形态 |
|---|---|---|
| **个人简历** | 一次 | 「Personal Projects」节加项目名 + GitHub 链接 + 一句话描述 |
| **GitHub 个人主页 README** | 一次 | Pin 这个仓库到主页 |
| **LinkedIn / 即刻 / X** | 一次 | 「我做了个浏览器内手部追踪 + 洞洞波」+ demo GIF |
| **掘金 / Dev.to / Medium** | 一次 | 技术博客：「用 MediaPipe + Three.js 实现浏览器手势识别」 |
| **V2EX 创意节点** | 一次 | 项目分享帖 |
| **少数派** | 一次（可选）| 投稿独立项目 |
| **ProductHunt** | 一次（可选）| 在 Maker section 提交 |
| **r/javascript / r/programming**（Reddit） | 一次 | 海外曝光 |

发完上面这些，自然能聚集 100-500 star。Star 数 + 真实 demo + 干净代码 = **简历加分项 √**。

---

## 后续可选的工程优化

如果想让项目「看起来更专业」，可以做的事（按 ROI 排序）：

1. **加单元测试** — 至少给 `gesture.ts` 的 `computeFingerCurls`、滑窗角速度、状态机迁移写几个 vitest，证明工程素养
2. **加 GitHub Actions CI** — push 时跑 `tsc --noEmit` 和 `npm run build`，README 加 build status badge
3. **拆 bundle** — Vite 的 build warning 提示 chunk > 500kB，可以做 dynamic import 分离 mediapipe
4. **加 i18n** — 用 i18next 把 UI 文字提取出来，提供 EN/CN 切换（招聘者英文优先）
5. **加 PWA 配置** — `vite-plugin-pwa`，安装到桌面 / 离线运行
6. **写英文 README** — `README.md` 改英文，`README.zh-CN.md` 保留中文版（开源生态更国际化）

这些都不是必须，但是有任何一项都能让仓库「层次更高」。
