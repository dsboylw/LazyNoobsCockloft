# 发布到 GitHub（步骤）

本目录已经是发布就绪状态：源码 + 构建产物 + 脚本 + LICENSE + README。
本机当前**没有 git、没有 GitHub 凭据**，所以发布需要先做一次环境准备。

## 一次性准备（只需做一次）

1. 安装 git（自带 Git Credential Manager，推送时会弹浏览器登录 GitHub）：

   ```powershell
   winget install --id Git.Git -e
   # 装完重开终端，配置身份（邮箱和用户名随意，公开仓库建议用 noreply 邮箱）
   git config --global user.name  "你的名字"
   git config --global user.email "你的GitHub用户名@users.noreply.github.com"
   ```

2. 在 github.com 上新建一个**空**仓库：名字建议 `dsh-session-notes`，不要勾选任何初始化文件（README/LICENSE/.gitignore 都不要，本目录已自带）。

## 发布（或更新）

```powershell
cd E:\DSH\lazyrookie

git init
git add .
git commit -m "dsh-session-notes 0.1.0: per-session notes plugin for DSH Desktop"
git branch -M main
git remote add origin https://github.com/<你的用户名>/dsh-session-notes.git
git push -u origin main
```

第一次 push 时 Git Credential Manager 会弹浏览器让你授权 GitHub —— 登录即可。

## 发版本（可选，让用户直接下 zip）

```powershell
# 打 tag 推上去
git tag v0.1.0
git push origin v0.1.0
```

然后到 GitHub 仓库页 → Releases → Draft a new release → 选 tag `v0.1.0`
→ 上传 `E:\DSH\releases\dsh-session-notes-0.1.0.zip` → Publish。
用户在 Release 页直接下载 zip 解压，跑 `install.ps1` 就能装。

## 备选：不用 git

直接在 github.com 网页上 "Add file → Upload files" 拖入本目录内容也能发布，
但后续更新没有版本管理，不建议长期用。

## 装好 git 之后

跟我说一声"git 装好了，仓库地址是 xxx"，我可以直接替你执行 init/commit/push 全流程。
