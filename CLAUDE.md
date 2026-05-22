# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

实时手部追踪 + 手势驱动的「洞洞波」演示。浏览器纯前端，无后端。摄像头画面通过 MediaPipe 提取 21 个手部关键点，驱动 Three.js 场景里的 3D 手骨骼，握拳蓄力→张开发射能量球。

页面布局：
- 左上角 `#status-text` — 当前手势状态文字
- 中间 `#scene` (full-screen canvas) — Three.js 3D 场景
- 右下角 `#video-wrap > #cam` — 摄像头预览（水平镜像）

## Commands

```bash
npm install            # one-time setup
npm run dev            # vite dev server on :5173 (HMR)
npm run build          # tsc --noEmit + vite production build → dist/
npm run preview        # serve the built dist/
npx tsc --noEmit       # type-check only, no build artifacts
```

启动后浏览器需要授予摄像头权限。MediaPipe 模型 + WASM 从 CDN 加载（jsdelivr/storage.googleapis.com），首次启动会有几百 KB 下载。

## Architecture

```
src/main.ts              ← 入口 / 主循环 / DOM 接线
├─ HandTracker          (hand-tracker.ts)   getUserMedia + MediaPipe Hand Landmarker
├─ HandSkeleton         (hand-skeleton.ts)  21 关节球 + 骨骼线条 mesh group
├─ GestureDetector      (gesture.ts)        状态机：idle→charging→ready→fired→cooldown
├─ EnergyBall           (effects.ts)        蓄力 + 发射特效
├─ createFloorRing      (effects.ts)        地面椭圆环
└─ createStarfield      (starfield.ts)      背景星空 Points
```

### 数据流（每帧 requestAnimationFrame）

1. `HandTracker.detect()` 从 `<video>` 拉一帧给 MediaPipe，得到归一化 `[0,1]` landmark 数组（21 点，含 z 相对深度）。
2. `HandSkeleton.update(landmarks)` 把坐标映射到场景空间：`x = (1 - lm.x)*2 - 1`（**X 取反做镜像**，让屏幕里的手和用户视角一致）、`y = -(lm.y*2 - 1)`、`z = -lm.z*2`，并以 `lerp(0.35)` 做时间平滑，避免抖动。
3. `GestureDetector.update(skeleton, dt, hasHand)` 用 `computeCurl()` 算指尖→掌心 MCP 的归一化距离均值（以腕→食指 MCP 为尺度），输出 0..1 的握拳度。阈值：`curl > 0.7` 视为握拳，`curl < 0.25` 视为张开。
4. `EnergyBall` 根据 `GestureState` 渲染：`charging` 跟随掌心生长、`ready` 锁定满级、`fired` 沿 −Z 飞出并淡出。
5. 顶部状态文字直接由 `snap.label` 驱动。

### 坐标系约定

- 场景空间约定：相机 `(0,0,5)` 看向 −Z，手的 Z 值越负代表越远。
- 手部 landmark 的 z 是 MediaPipe 的相对深度（手腕为 0，越靠近相机越负），项目里乘 `-2` 后符合场景方向（向相机伸手 → z 增大）。
- 视频元素 `#cam` 通过 CSS `transform: scaleX(-1)` 做镜像，但 **MediaPipe 看的是未镜像的原视频流**，所以骨骼那边手动在 `HandSkeleton.update` 里翻 X。两处不要重复镜像。

### 手势状态机（gesture.ts）

```
idle ──(fist)──► charging ──(level→1)──► ready ──(open palm)──► fired ──► cooldown ──► idle
                    │                       │
                    └─(release fist)─► 衰减 │
                                            └─(lost tracking)─► idle
```

- 蓄力速率 `chargeRate = 0.9 /s`，放松时 `decayRate = 1.5 /s`。
- `fired` 只持续一帧用于触发 `EnergyBall.launch()`，随后立刻进入 `cooldown`（0.8 秒）。
- 状态机的 label 是 UI 唯一来源，新增状态时记得同步 label。

## Conventions & Gotchas

- **依赖 CDN**：MediaPipe 的 WASM 和模型路径写死在 `hand-tracker.ts` 顶部（`WASM_BASE`, `MODEL_URL`）。离线环境需要本地化这两个 URL。
- **单手追踪**：`numHands: 1`。改成双手时 `HandSkeleton` 也要扩成多实例。
- **landmark 索引参考**（用于扩展手势）：0=腕、4=拇指尖、8=食指尖、12=中指尖、16=无名指尖、20=小指尖、5/9/13/17=各指 MCP。
- **平滑**：`HandSkeleton.update` 第一次拿到数据时直接对齐（`SMOOTH=1.0`），之后才插值，避免重新进入视野时从老位置滑过来。
- **构建警告**：`vite build` 会提示 bundle > 500 kB，是 three + @mediapipe/tasks-vision 体积，正常忽略。要优化就做动态 import 分包。
- **不要** 把 `tracker.detect()` 同一帧调用两次 —— 内部用 `lastVideoTime` 去重，但额外开销没必要。

## File-by-file summary

| 文件 | 职责 |
|---|---|
| `index.html` | 页面骨架、状态栏 / 视频 / canvas / 启动按钮 |
| `src/main.ts` | 场景装配、动画循环、把追踪/手势/特效接到一起 |
| `src/style.css` | 全局样式（毛玻璃徽章、视频窗口、启动按钮） |
| `src/hand-tracker.ts` | MediaPipe Hand Landmarker 封装 |
| `src/hand-skeleton.ts` | 3D 骨骼 mesh + 平滑 + 关节访问器 |
| `src/gesture.ts` | curl 计算 + 状态机 + UI label |
| `src/effects.ts` | 能量球生命周期、地面环 |
| `src/starfield.ts` | 背景星空粒子 |
