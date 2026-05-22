# Hand Tracking Kamehameha

> 浏览器内实时手部 21 关节追踪 + 3D 骨骼可视化 + 手势驱动「龟派气功」粒子特效。MediaPipe + Three.js + TypeScript，纯前端零后端。

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)
![Three.js](https://img.shields.io/badge/Three.js-r170-green.svg)
![Vite](https://img.shields.io/badge/Vite-8-purple.svg)

---

## 在线体验 · Live Demo

> 🌐 https://hand-tracking-kappa.vercel.app/

🎬 **演示视频 / GIF**

<!-- 在 docs/media/demo.gif 放好后取消下一行注释 -->
![demo](./docs/media/demo.gif)

---

## 特性

- 🖐 **实时 21 关节手部追踪** — MediaPipe Hand Landmarker，GPU 加速，30 FPS+
- 🦴 **3D 骨骼可视化** — 21 个关节球 + 21 根圆柱骨头，用 `setFromUnitVectors` 实时朝向
- 🎯 **指点手势识别** — 「握拳 + 伸食指」 = 蓄力姿势，对四指弯曲度独立判定
- ⚡ **粒子蓄力动画** — 80 个 additive-blended 粒子从远处球壳汇聚到食指尖，3 秒蓄满
- 💥 **角速度发射** — 食指角速度峰值 > 4.5 rad/s 触发发射，球速按峰值线性映射
- 🌌 **空间场景** — 星空粒子、地面光环、能量光束 + 24 帧轨迹拖尾
- 🔒 **完全本地** — 摄像头数据 100% 在浏览器内处理，无任何网络上传
- 📱 **响应式 + 镜像** — 屏幕里的 3D 手与你视频里看到的方向一致

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 手部追踪 | [`@mediapipe/tasks-vision`](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) — 浏览器内 WebAssembly + GPU 推理 |
| 3D 渲染 | [Three.js](https://threejs.org/) r170 |
| 构建 | Vite 8 + TypeScript 5 |
| 摄像头 | `navigator.mediaDevices.getUserMedia` |
| 部署 | 纯静态，可部署到任意 CDN |

---

## 工作原理

```
摄像头 ──▶ <video> ──▶ MediaPipe (WASM + GPU)
                         │
                         │   Palm SSD ──▶ bbox
                         │   Landmark Net ─▶ 21 × (x, y, z)
                         ▼
                 HandSkeleton.update()
                 - 坐标映射 + 镜像翻 X
                 - lerp 时间平滑（消抖）
                 - 摆放 21 个关节球 + 21 根 cylinder 骨头
                         │
                         ▼
                 GestureDetector.update()
                 - per-finger curl（MCP→TIP 直线 / 关节段累加）
                 - 「指点」姿势检测（食指伸 + 其他三指弯）
                 - 食指方向 0.2s 指数平滑（发射方向）
                 - 角速度滑窗峰值（0.25s 窗口）
                 - 状态机 idle → aiming → paused → charged → fired → cooldown
                         │
                         ▼
                 ChargeParticles + EnergyBall + UI label
```

### 几个值得看的算法点

- **`HandSkeleton.update()`**（`src/hand-skeleton.ts:76`）— 把 MediaPipe 归一化 `[0,1]` landmarks 映射到 Three.js `[-1,1]` 场景空间，X 翻转做镜像
- **`computeFingerCurls()`**（`src/gesture.ts:50`）— 用每个手指的「MCP→TIP 直线距离 / 关节段累加距离」作为弯曲度，避免基于绝对距离的尺度问题
- **滑窗角速度**（`src/gesture.ts:113`）— 用 0.25s 历史窗口取最大角速度，避免单帧抖动导致误发射
- **粒子三态切换**（`src/particles.ts`）— `spawn` 在球壳上随机分布、`converge` 加速向目标、`fire` 给一次性脉冲后只衰减

---

## 快速开始

### 前置要求

- Node.js 20+
- 现代浏览器（Chrome/Edge/Safari/Firefox 最新版）
- 摄像头

### 运行

```bash
git clone https://github.com/<your-handle>/gesture.git
cd gesture
npm install
npm run dev
```

打开浏览器到 `http://localhost:5173`，授予摄像头权限，把手伸到画面里。

### 构建生产版本

```bash
npm run build       # 输出到 dist/
npm run preview     # 预览构建产物
```

### 类型检查

```bash
npx tsc --noEmit
```

---

## 怎么玩

1. **点击「点击启动摄像头」** → 授予权限
2. **把手伸到画面中央** → 看到青色 3D 手部骨骼跟随
3. **握拳 + 伸出食指**（「指点」姿势） → 粒子开始从远处汇聚到食指尖
4. **保持 3 秒** → 能量满级
5. **快速甩动食指**（手腕不动，食指快速画弧） → 发射光束 + 粒子流

> 💡 状态栏会实时显示当前手势状态和弯曲度百分比，方便理解判定逻辑

---

## 项目结构

```
gesture/
├─ src/
│  ├─ main.ts              # 入口 / 主循环 / DOM 接线
│  ├─ hand-tracker.ts      # MediaPipe Hand Landmarker 封装
│  ├─ hand-skeleton.ts     # 21 关节球 + cylinder 骨头 mesh group
│  ├─ gesture.ts           # 指点姿势检测 + 角速度计算 + 状态机
│  ├─ particles.ts         # 80 粒子的汇聚 / 保持 / 散开 / 发射
│  ├─ effects.ts           # 能量球 + 发射拖尾 + 地面光环
│  ├─ starfield.ts         # 背景星空粒子
│  └─ style.css
├─ index.html
├─ vite.config.ts          # 含 MediaPipe 预构建配置
├─ docs/
│  ├─ deployment.md        # 部署与 demo 录制指南
│  └─ exploration/         # ⚠️ 产品方向探索文档（已放弃做产品，作为思考记录保留）
├─ CLAUDE.md               # 给 AI 协作者看的项目指南
└─ LICENSE                 # MIT
```

---

## 已知限制

- **iOS Safari**：MediaPipe WASM GPU delegate 在部分 iOS 版本上回退到 CPU，可能慢
- **低光环境**：手部 landmark 抖动会显著增加，平滑参数（`gesture.ts:FORWARD_SMOOTH_S`）可能需要调
- **单手追踪**：`numHands: 1` 写死，扩多手需要 `HandSkeleton` 多实例
- **「甩」动作判定**：基于食指角速度，对个体差异敏感，阈值（`FIRE_RATE_THRESHOLD = 4.5 rad/s`）可能要根据用户调整
- **MediaPipe 模型从 CDN 加载**：首次启动需要下载 ~5MB；离线场景需要把 URL 本地化

---

## 关于产品方向探索

这个 demo 起初是想发展为一个商业产品（先后探索过演示控制器、儿童早教、近视防控、办公族颈椎拉伸等方向）。经过 7 轮调研与否决后，最终诚实地承认 **手势 / 姿势识别更适合作为已有产品的辅助功能，而不是独立 App 的核心价值**。

完整的产品探索文档保留在 [`docs/exploration/`](./docs/exploration/)，包括 7 次方向调研、深度可行性评估、放弃决策的全过程，作为后人想做类似方向的避坑参考。

---

## 致谢

- [Google MediaPipe](https://developers.google.com/mediapipe) — 手部追踪模型
- [Three.js](https://threejs.org/) — 3D 渲染引擎
- 项目灵感来源于《龙珠》

---

## License

[MIT](./LICENSE) © 2026
