# 谷圈欧气局：多人翻牌抽选

这是一个可以放在 GitHub Pages 上的谷圈多人抽选网页。主理人设置总手数、回血位数量和每个圈名可开的次数；谷友通过同一个链接进入，开牌战报会共享并保留。

## 第一步：创建免费数据库

1. 打开 [Supabase](https://supabase.com/) 并注册，创建一个免费项目。
2. 进入项目后打开 **SQL Editor**，新建查询。
3. 复制 `supabase.sql` 的全部内容，粘贴进去并点击 **Run**。
4. 打开 **Project Settings → API**（有些新版界面叫 **Connect**）。
5. 记下项目的 **Project URL** 和 **anon / publishable key**。不要使用 `service_role` 或 `secret` key。

## 第二步：填入连接信息

打开 `config.js`，把两处占位文字替换掉：

```js
window.LOTTERY_CONFIG = {
  supabaseUrl: "https://你的项目.supabase.co",
  supabaseAnonKey: "你的 anon 或 publishable key"
};
```

Supabase 的 anon/publishable key 本来就是供网页公开使用的。真正的数据权限已经由 `supabase.sql` 中的规则限制；不要把 service_role/secret key 放进网页。

## 第三步：发布到 GitHub Pages

1. 在 GitHub 新建一个公开仓库。
2. 把这个文件夹里的 `index.html`、`style.css`、`app.js`、`config.js`、`supabase.sql` 和 `README.md` 上传到仓库根目录。
3. 打开仓库 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**。
5. Branch 选择 `main` 和 `/ (root)`，保存。
6. 等一两分钟，GitHub 会显示网页地址。

## 使用方法

- 创建者打开网站，切换到“创建抽奖”，填写数量后创建活动。
- 创建成功后复制邀请链接发给朋友。
- 朋友输入名字并翻牌；页面每 2.5 秒同步一次，结果会一直保留。
- 手机端已针对竖屏、触摸操作和底部安全区域优化；中奖时会有翻牌、轻震与彩纸动画（手机关闭动画或不支持震动时会自动跳过）。
- 创建活动的浏览器会保存管理员身份，可以暂停抽奖或清空本轮结果。
- 管理员身份仅保存在当前浏览器。请不要清理该网站的浏览器数据；否则仍能看活动，但不能管理它。

## 适用范围与限制

- 适合熟人之间的小型活动，不需要注册登录。
- “每人次数”按名字判断，因此参与者改名后会被当作另一个人；如果需要严格防作弊，需要增加账号登录。
- 活动码相当于查看口令，拿到链接的人都能看到参与者姓名和结果。请不要填写敏感个人信息。
- 抽取在数据库中串行执行，多人同时点击也不会重复占用同一张牌。
