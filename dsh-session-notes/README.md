# dsh-session-notes

**DSH 会话备注插件**（DSH Desktop / Web 通用，`web` 平台客户端插件）。给每个会话挂一条备注，不用再翻会话历史找提示语。

[中文](README.md) | [English](README.en.md)

## 为什么写这个插件

用 DSH 桌面版时发现一个问题：我经常在一个会话里反复用同一条提示语去要数据，每次都得往前翻聊天记录、拷贝、再粘回去，很麻烦；右键会话也没有备注栏，索性自己写了一个。

之前装过 fun-ticker，觉得不好用就卸载了——那个插件本身也不是按桌面版适配的，卸载也没卸干净。索性借着他的一些结构，改出了这个备注插件。

有备注的会话会列在总览里：点击备注可以跳转到对应会话，备注里写的内容（比如提示词）也能一键复制。

懒~~~~ 就是了~ 又菜又懒，咋办啊……

## 功能

- **📝 头部按钮**（会话标题旁）：打开编辑弹层；当前会话有备注时按钮带绿点
- **编辑弹层**
  - 当前会话备注编辑，防抖自动保存（400ms），显示"已保存 ✓"
  - **复制按钮**：一键复制备注全文
  - 5 色标记点（default / amber / rose / sky / lime）
  - **全部备注总览**：所有带备注的会话（工作区徽标 + 标题 + 备注预览 + 每行复制按钮），点击行直达该会话
  - 底部备注栏开关（持久化）
- **底部常驻条**：当前会话有备注时显示在输入框上方（色点 + 工作区徽标 + 会话标题 + 备注预览 + 复制按钮），点击预览打开弹层
- **长文本截断**：总览行工作区 5 字 / 标题 8 字 / 备注 15 字，底部条工作区 5 字 / 标题 8 字 / 备注 20 字，超出显示 …；鼠标悬停看全文，**复制按钮始终复制完整内容**
- 数据存宿主 settings 文档（命名空间 `dsh-session-notes`），按会话 ID 持久化，重启不丢
- 清空备注文本 = 删除该备注；上限 2000 条 / 单条 20000 字符

## 安装（DSH Desktop）

**方式 A：一键脚本（推荐）**

```powershell
# 在仓库/解压目录里
powershell -ExecutionPolicy Bypass -File .\build.ps1     # 从源码构建（发布包可跳过）
powershell -ExecutionPolicy Bypass -File .\install.ps1   # 拷入 profile + 写入 patch
# 重启 DSH Desktop（完全退出再打开）
```

**方式 B：手动**

1. 把 `package.json` + `lib\index.js` + `lib\client.js` 拷到
   `%APPDATA%\dsh-desktop\harness\profiles\web\node_modules\@deepseek-ai\dsh-session-notes\`（保持 `lib\` 子目录）
2. 编辑 `%APPDATA%\dsh-desktop\harness\profiles\web\cordis.patch.yml`，在**第一个 `- insert:` 块**里加：

   ```yaml
   - insert:
       # ...已有的行...
       - id: session-notes
         name: '@deepseek-ai/dsh-session-notes'
   ```

3. 重启 DSH Desktop

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
# 或手动：删掉 cordis.patch.yml 里那两行 session-notes + 删除 node_modules 里的包目录
```

改 `cordis.patch.yml` 前脚本会自动备份（`cordis.patch.yml.bak-<时间戳>`）。若应用无法启动，桌面安全模式会自动隔离插件，恢复后用备份文件还原即可。

## 构建

依赖：Windows PowerShell、node ≥ 20、[esbuild](https://esbuild.github.io/) 二进制（脚本里 `$Esbuild` 变量改成本机路径即可）。

```powershell
.\build.ps1
```

- 宿主端：`src/index.js` → ESM bundle（external `@deepseek-ai/*`，闭包由 DSH 应用提供）
- 客户端：`src/client/index.tsx` → CJS bundle（external `react` / `react-dom` / `@deepseek-ai/*`），再包一层 `window.__ModuleLoader__.load({ id, factory })`
- 冒烟测试：stub 宿主服务 + ModuleLoader，跑完宿主路由全流程和客户端 slot 注册

## 架构 / 挂点

| 端 | 入口 | 做的事 |
|---|---|---|
| 宿主 | `src/index.js` | 注册 settings 命名空间（可调用 schema + `toJSON`）和 API 路由 |
| 客户端 | `src/client/index.tsx` | slot 注册、store、会话行投影；`inject: ['slots', 'locale', 'sessions']` |

| Slot | 内容 |
|---|---|
| `conversation.session.header.actions` | 📝 按钮 + 弹层 |
| `conversation.input.dock` | 底部常驻备注条 |

**API**（`/plugins/dsh-session-notes/api`，宿主 `webServer` 服务 prefix 路由）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/settings` | 读全部（notes + barEnabled） |
| POST | `/settings` | 整体替换（服务端清洗校验） |
| GET | `/notes` | 只读备注表 |
| PUT | `/notes/:id` | 新增/更新（text/color/pinned；缺 color 沿用旧值） |
| DELETE | `/notes/:id` | 删除一条 |

**踩坑记录**（给后来写 DSH 插件的人）：

- 宿主端 HTTP 服务叫 `webServer`（`ctx.inject(['settings', 'webServer'], ...)` + `host.webServer.register(...)`），不存在 `httpServer` 服务
- 槽位条目的 `sessionId` **不是组件 prop**，是注入工厂的第一个参数：`inject: (sessionId) => ({ ... })`
- 客户端产物必须是 `window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => {...} })` 包裹的 CJS，`react` / `react/jsx-runtime` 由 loader 的 require 提供
- settings 的 schema 必须可调用（`resolve` 会执行 `schema(merged)`）且带 `.toJSON()`（`describe()` 会用）

## 目录

```
src/index.js            宿主入口：settings + API 路由
src/client/index.tsx    客户端入口：slot 注册、store、会话投影
src/client/ui.tsx       弹层 + 底部条 UI
src/client/store.ts     自包含 observable store + useSyncExternalStore hook
src/client/api.ts       同源 fetch 封装
src/client/clipboard.ts 复制（clipboard API + execCommand 兜底）
src/client/locales.ts   zh/en 词典
src/client/styles.ts    样式注入（dsw CSS 变量，适配深浅色）
build.ps1               构建 + 冒烟
install.ps1             一键安装到桌面 profile
uninstall.ps1           一键卸载
test/smoke.mjs          冒烟测试（宿主 + 客户端）
test/host-drive.mjs     宿主路由直驱复测
```

## License

MIT
