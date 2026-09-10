# 多人实时抽奖网页

这版适合几个人共用同一个 GitHub Pages 链接。

## 功能
- 输入名字进入抽奖
- 管理员设置：
  - 总卡片数
  - 中奖数量
  - 每人最多抽几次
- 所有人实时看到剩余数量与抽奖记录
- 同一张卡不会重复被抽
- 同一名字受每人次数限制
- 刷新页面后记录仍保留
- 一轮结束后可由管理员创建新一轮

## 1. 创建 Supabase 项目
1. 打开 Supabase，建立一个免费 Project。
2. 进入 SQL Editor。
3. 把 `supabase.sql` 全部粘贴进去并执行。
4. 到 Project Settings -> API，复制：
   - Project URL
   - anon / public key

## 2. 修改 app.js
打开 `app.js`，修改最上面的：

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const ADMIN_PASSWORD = "CHANGE_ME";
```

例如：

```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
const ADMIN_PASSWORD = "123456";
```

注意：当前管理员密码只是前端口令，适合熟人小范围使用，并不属于高安全方案。

## 3. 上传 GitHub
把这 3 个网页文件放到仓库根目录：
- index.html
- styles.css
- app.js

然后 GitHub:
Settings -> Pages -> Deploy from a branch -> main / root

等待几十秒到几分钟，就会得到你的 GitHub Pages 链接。

## 4. 开始使用
1. 管理员打开网页，点右上角“管理员”。
2. 输入管理员密码。
3. 设置总卡数、中奖数、每人次数。
4. 点击“创建 / 重置本轮”。
5. 把同一个 GitHub Pages 链接发给其他人。
6. 每个人输入自己的名字后开始抽卡。

## 下一版可继续增加
- 自定义每张卡的奖品名称
- 多种奖品等级
- 翻牌动画
- 名单预先导入
- 房间邀请码
- 管理员单独后台
- 导出 Excel / CSV
- 防止改名重复抽
- 手机端更像“小程序”的 UI
