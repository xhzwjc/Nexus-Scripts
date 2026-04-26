# 团队资源 / AI Studio 迁移与初始化说明

这份说明覆盖 3 类场景：

1. 先在“内容最全”的旧机器上，把数据库内容反写回备份文件
2. 再把备份文件和本地 logo 一起迁移到新 Mac
3. 在新 Mac 上初始化团队资源、AI Studio、AI 招聘基础库，以及正式 RBAC 用户 / 角色 / 密钥

本文默认你使用的是仓库根目录下的最新脚本：

- [sync_resource_backups.py](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/sync_resource_backups.py)
- [sync_resource_backups.bat](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/sync_resource_backups.bat)
- [sync_resource_backups.sh](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/sync_resource_backups.sh)
- [bootstrap_resources_recruitment.py](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/bootstrap_resources_recruitment.py)
- [bootstrap_resources_recruitment.bat](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/bootstrap_resources_recruitment.bat)
- [bootstrap_resources_recruitment.sh](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/bootstrap_resources_recruitment.sh)
- [export_script_hub_rbac_seed.py](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/export_script_hub_rbac_seed.py)
- [export_script_hub_rbac_seed.bat](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/export_script_hub_rbac_seed.bat)
- [export_script_hub_rbac_seed.sh](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/export_script_hub_rbac_seed.sh)

## 场景速查

如果你现在只想先执行命令，不想先通读全文，直接按下面选：

### 1. 当前这台 Mac 的 `team-resources.enc.json` 不全，但数据库内容是对的

只反写团队资源：

```bash
./sync_resource_backups.sh --only team
```

### 2. 当前这台 Mac 的团队资源和 AI Studio 备份都要从数据库重写

同时反写两份备份：

```bash
./sync_resource_backups.sh
```

### 3. Windows 那台机器的数据更全，准备以它为准导出

同时反写团队资源和 AI Studio：

```bat
sync_resource_backups.bat
```

如果只想先补团队资源：

```bat
sync_resource_backups.bat --only team
```

如果只想先补 AI Studio：

```bat
sync_resource_backups.bat --only ai
```

### 4. 新 Mac 要重新初始化资源、招聘基础库和正式用户

```bash
./bootstrap_resources_recruitment.sh --mode overwrite
```

如果还要重新生成一套新的 access key：

```bash
./bootstrap_resources_recruitment.sh --mode overwrite --regenerate-keys
```

## 一、先理解哪些数据是“源数据”

### 1. 团队资源

运行时以 MySQL 为准：

- `team_resource_groups`
- `team_resource_systems`
- `team_resource_environments`
- `team_resource_credentials`

备份文件：

- [my-app/data/team-resources.enc.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/data/team-resources.enc.json)

注意：

- 这个文件是“数据库完整明文对象 -> 再整体加密”生成的
- 只要数据库更完整，就应该先从数据库反写这个文件

### 2. AI Studio / AI 资源库

运行时也以 MySQL 为准：

- `ai_categories`
- `ai_resources`

备份文件：

- [my-app/data/ai-resources.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/data/ai-resources.json)

注意：

- 如果数据库内容比 `ai-resources.json` 更新，就应该重新从数据库导出

### 3. 本地 logo 文件

这两个目录也要一起迁移，否则数据恢复后 logo 可能缺失：

- [my-app/public/team-logos](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/public/team-logos)
- [my-app/public/ai-logos](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/public/ai-logos)

### 4. AI 招聘

这次按你的要求，只做：

- 初始化数据库表
- 初始化默认配置 / 默认技能 / 默认基础种子
- 确保页面和接口可访问

这次不迁移 AI 招聘的历史业务数据。

### 5. 用户 / 角色 / access key

现在 RBAC 分成两层：

- 可提交的正式初始化基线：
  [fastApiProject/data/script_hub_rbac_seed.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/fastApiProject/data/script_hub_rbac_seed.json)
- 只保留本地明文 access key 的文件：
  [fastApiProject/data/bootstrap_users.local.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/fastApiProject/data/bootstrap_users.local.json)

两者的职责不同：

- `script_hub_rbac_seed.json`：
  保存正式用户、角色、角色分配、权限覆盖，不保存明文 key，可以提交到仓库
- `bootstrap_users.local.json`：
  保存本地可登录的明文 access key，不能提交

初始化时脚本会：

1. 先按 `script_hub_rbac_seed.json` 同步正式用户和角色
2. 再为这些用户生成或复用本地 access key

也就是说：

- 你可以把“正式用户 / 正式角色”放进仓库
- 但不要把明文 key 放进仓库

## 二、必须一起带走的环境变量

最稳妥的做法是：直接把旧机器根目录 `.env` 原样带到新机器。

至少要保证这些值一致：

- `DB_LOCAL_HOST`
- `DB_LOCAL_PORT`
- `DB_LOCAL_USER`
- `DB_LOCAL_PASSWORD`
- `DB_LOCAL_DATABASE`
- `SCRIPT_HUB_SESSION_SECRET`
- `TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY`
- `TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY`

特别注意：

- 如果你迁的是 MySQL 整库，`TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY` 必须一致，否则团队资源密码字段无法正确解密
- 如果你是靠 `team-resources.enc.json` 重建团队资源，`TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY` 必须一致，否则这个文件无法解密导入

## 三、标准推荐流程：先以 Windows 那台更全的机器为准

这是最推荐的流程。

### 第一步：在 Windows 那台“内容更全”的机器上更新备份文件

把最新项目代码同步到 Windows 机器后，在仓库根目录执行：

```bat
sync_resource_backups.bat
```

如果你只想先补团队资源加密备份：

```bat
sync_resource_backups.bat --only team
```

如果你只想先补 AI Studio：

```bat
sync_resource_backups.bat --only ai
```

如果你只想先看表里有没有数据，不实际写文件：

```bat
sync_resource_backups.bat --dry-run
```

执行后会做两件事：

1. 从 MySQL 当前数据导出 AI Studio 到：
   [my-app/data/ai-resources.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/data/ai-resources.json)
2. 从 MySQL 当前数据重新生成团队资源加密备份到：
   [my-app/data/team-resources.enc.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/data/team-resources.enc.json)

执行成功后，Windows 那台机器上的这两个文件应被视为“最新基线文件”。

### 第二步：从 Windows 机器打包这几样东西

从 Windows 机器拷贝以下内容：

- 根目录 `.env`
- [my-app/data/ai-resources.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/data/ai-resources.json)
- [my-app/data/team-resources.enc.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/data/team-resources.enc.json)
- [my-app/public/ai-logos](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/public/ai-logos)
- [my-app/public/team-logos](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/my-app/public/team-logos)

如果你想把新 Mac 上的 access key 也固定下来，建议顺手一起带这个文件：

- [fastApiProject/data/bootstrap_users.local.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/fastApiProject/data/bootstrap_users.local.json)

如果你不带这个文件，新 Mac 初始化时会重新生成一组新的 key。

## 四、在新 Mac 上初始化

### 第一步：准备项目和文件

1. 克隆项目到新 Mac
2. 把旧机器打包出来的 `.env` 放到仓库根目录
3. 把下面这些文件 / 目录覆盖到新 Mac 同路径：

- `my-app/data/ai-resources.json`
- `my-app/data/team-resources.enc.json`
- `my-app/public/ai-logos`
- `my-app/public/team-logos`
- 可选：`fastApiProject/data/bootstrap_users.local.json`

### 第二步：执行初始化脚本

在仓库根目录执行：

```bash
./bootstrap_resources_recruitment.sh --mode overwrite
```

如果你更喜欢直接用 Python：

```bash
python3 bootstrap_resources_recruitment.py --mode overwrite
```

这个脚本会做这些事情：

1. 导入 `ai-resources.json` 到 MySQL
2. 导入 `team-resources.enc.json` 到 MySQL
3. 初始化 AI 招聘数据库结构和默认种子
4. 按 `script_hub_rbac_seed.json` 初始化角色 / 权限 / 正式用户
5. 生成或复用 `bootstrap_users.local.json`

### 第三步：查看生成的 access key

脚本执行后会打印 access key，同时会把结果保存在：

- [fastApiProject/data/bootstrap_users.local.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/fastApiProject/data/bootstrap_users.local.json)

默认情况下：

- 如果仓库里存在 `script_hub_rbac_seed.json`，就以它作为正式 RBAC 基线
- 如果这个文件不存在，脚本才会退回到最小默认用户

### 第三点五步：初始化后重新登录

Script Hub 的权限会写进登录 token。
所以只要你刚执行过初始化、重跑过 RBAC、或者刚补齐过 admin 权限，就一定要退出当前登录态后重新用 access key 登录一次。

否则前端仍然会拿旧 token，表现出来就会像：

- 明明数据库里已经有权限了，但页面菜单没刷新
- `AI 招聘` 看不到
- `权限中心` 看不到

### 第四步：启动服务

```bash
./start_services.sh
```

或者分别启动前后端。

## 五、如果当前 Mac 数据不全，但数据库是对的

如果你现在这台 Mac 的备份文件不全，但数据库内容是对的，不一定非要去 Windows。

你可以直接在当前 Mac 上执行：

```bash
./sync_resource_backups.sh
```

这会把当前 Mac 的数据库完整内容反写回：

- `my-app/data/ai-resources.json`
- `my-app/data/team-resources.enc.json`

然后再把这些文件迁移到新 Mac。

如果你眼下只关心团队资源加密备份补全，可以只执行：

```bash
./sync_resource_backups.sh --only team
```

如果你只想先把 AI Studio 从数据库重新导出来，可以执行：

```bash
./sync_resource_backups.sh --only ai
```

## 六、如果 Windows 才是唯一最完整的数据源

如果 Windows 那台机器的数据库最完整，而当前 Mac 的数据库和文件都不完整，正确顺序是：

1. 在 Windows 上执行 `sync_resource_backups.bat`
2. 用 Windows 上导出的 `ai-resources.json` 和 `team-resources.enc.json` 作为唯一基线
3. 连同 logo 目录和 `.env` 一起拷到新 Mac
4. 在新 Mac 上执行 `bootstrap_resources_recruitment.sh --mode overwrite`

不要反过来用当前 Mac 的旧备份去覆盖 Windows 的新数据。

## 七、如果你只想刷新备份文件，不动数据库

只执行：

```bash
./sync_resource_backups.sh
```

或 Windows：

```bat
sync_resource_backups.bat
```

这个脚本不会导入数据库，只会：

- 从数据库读取 AI Studio
- 从数据库读取团队资源
- 反写备份文件

适合“整理源文件、准备迁移包”的场景。

## 八、如果你只想初始化团队资源 / AI Studio / 招聘权限，不迁业务表

执行：

```bash
./bootstrap_resources_recruitment.sh
```

默认 `fill-empty` 模式下：

- 空表会导入
- 已有完整数据的表会跳过
- 不会粗暴覆盖已有内容

如果你明确要以备份文件为准覆盖：

```bash
./bootstrap_resources_recruitment.sh --mode overwrite
```

## 九、如果你想把“当前库里的正式用户 / 角色”导成初始化基线

这一步是安全的，因为导出的 seed 不包含明文 access key。

当前仓库已经支持用下面命令从 MySQL 导出正式 RBAC 基线：

```bash
./export_script_hub_rbac_seed.sh --exclude-role-codes cs --exclude-user-codes cs
```

Windows：

```bat
export_script_hub_rbac_seed.bat --exclude-role-codes cs --exclude-user-codes cs
```

这会生成：

- [fastApiProject/data/script_hub_rbac_seed.json](/Users/wangjingchuan/Documents/wjc/Code/Nexus-Scripts/fastApiProject/data/script_hub_rbac_seed.json)

当前你的库里，测试角色 / 测试用户就是：

- 角色：`cs`
- 用户：`cs`

所以现在建议固定用上面这条命令导出正式 seed。

## 十、关于 access key 的复用和重置

### 1. 想复用旧 key

把下面文件一起迁过去：

- `fastApiProject/data/bootstrap_users.local.json`

然后执行：

```bash
./bootstrap_resources_recruitment.sh --mode overwrite
```

脚本会优先按 `user_code` 复用这个文件里的 key。
同时会以 `script_hub_rbac_seed.json` 里的正式用户 / 角色为准重建权限。

### 2. 想重生成一套 key

执行：

```bash
./bootstrap_resources_recruitment.sh --mode overwrite --regenerate-keys
```

脚本会重写 `bootstrap_users.local.json`，生成一套新的 access key。

## 十一、推荐你实际执行时的命令顺序

### A. Windows 旧机导出为准

```bat
sync_resource_backups.bat
export_script_hub_rbac_seed.bat --exclude-role-codes cs --exclude-user-codes cs
```

然后拷走：

- `.env`
- `my-app/data/ai-resources.json`
- `my-app/data/team-resources.enc.json`
- `fastApiProject/data/script_hub_rbac_seed.json`
- `my-app/public/ai-logos`
- `my-app/public/team-logos`
- 可选：`fastApiProject/data/bootstrap_users.local.json`

### B. 新 Mac 初始化

```bash
./bootstrap_resources_recruitment.sh --mode overwrite
./start_services.sh
```

### C. 如果你想在新 Mac 上重新生成 key

```bash
./bootstrap_resources_recruitment.sh --mode overwrite --regenerate-keys
```

### D. 如果你要先在当前 Mac 把残缺备份补齐，再决定是否用 Windows

```bash
./sync_resource_backups.sh --only team
./sync_resource_backups.sh
./export_script_hub_rbac_seed.sh --exclude-role-codes cs --exclude-user-codes cs
```

前两条适合补资源备份，第三条适合把当前正式用户 / 角色导成初始化基线。

## 十二、验证迁移是否成功

### 1. 团队资源

- 能打开团队资源页面
- 组 / 系统 / 环境 / 凭证完整显示
- logo 正常显示

### 2. AI Studio

- 分类和资源条目数量正确
- logo 正常显示
- 编辑后可以保存

### 3. AI 招聘

- 页面可访问
- 招聘相关接口不报表不存在
- 默认技能 / 默认模型配置存在即可

### 4. 权限与用户

- 正式用户列表与 `script_hub_rbac_seed.json` 一致
- 测试用户 `cs` 不会被初始化进去
- `admin` / `operator` / `pm` / `qa` 能按 seed 中的角色与权限访问
- 初始化后重新登录一次再验证菜单与权限

## 十三、常见问题

### 1. `team-resources.enc.json` 解密失败

优先检查：

- `.env` 是否是旧机器那份
- `TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY` 是否一致

### 2. 团队资源密码显示为空或解密失败

优先检查：

- `TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY` 是否和写入数据库时一致

### 3. AI Studio 数据导出来了，但 logo 丢了

这是因为 logo 在本地目录里，不在数据库里。需要一起拷：

- `my-app/public/ai-logos`

### 4. 团队资源导出来了，但 logo 丢了

同理，需要一起拷：

- `my-app/public/team-logos`

### 5. 新 Mac 上只想重刷资源，不想动用户

如果你的意思是“只把备份文件从数据库重新导出来”，执行：

```bash
./sync_resource_backups.sh
```

如果你的意思是“只把资源重新导入数据库，但不要重建用户 / 角色 / 密钥”，执行：

```bash
cd fastApiProject
python migrate_resources.py
python migrate_team_resources.py
```

这两条只会导入：

- AI Studio 数据
- 团队资源数据

不会重建 Script Hub 用户。

### 6. 为什么仓库里提交了 RBAC seed，但没有提交 access key

因为数据库里只能拿到 access key 的哈希，拿不到原始明文 key。

所以现在的正确分工是：

- `script_hub_rbac_seed.json`：提交到仓库，保存正式用户 / 角色 / 权限结构
- `bootstrap_users.local.json`：只保留在本地，保存可登录的明文 key

如果另一台 Mac 不带旧的 `bootstrap_users.local.json`，也没关系。
初始化脚本会为 seed 里的正式用户重新生成一套新的本地 key。
