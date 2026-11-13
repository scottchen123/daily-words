# Daily Words 每日单词

👉 **打开网站 Open the site:** https://skot-chen.github.io/daily-words/

背单词 + 默写的小网站。手机、电脑打开都能用。

## 怎么用（推荐顺序）
1. **Cards 认词**：先看英文，自己想意思，再点「看意思」，然后诚实地选 不认识 / 模糊 / 认识。
2. **Write 默写**：看中文写英文。不会写可以点 💡 提示（首字母）或 📝 例句（句子填空）。
3. **Listen 听写**：听发音写单词。
4. **Print 打印**：打印成 A4 纸，沿虚线把答案折到背面。
5. **📅 Today's review 今日复习**：每天先做这个。学过的词会在 1、2、4、7、15、30 天后自动回来；写错的词当天就会回来。

> 学习进度保存在**你自己的浏览器**里，手机和电脑是分开的。页面底部「⚙ 学习进度」可以导出 / 导入。
>
> 📝 **我的笔记**：认词看完意思后点「📝 写笔记」，可以写自己的造句、备注和「一句话串记」（把几个词串成一句）。
> 勾选「☁ 同步到 GitHub」，笔记会存进仓库的 `notes/notes.json`，换手机、换电脑打开也能看到。
> 每台设备第一次要在页面底部「☁ 笔记同步」粘贴一个 GitHub 钥匙（fine-grained token，只给这个仓库 Contents 读写权限）。

## 每天加新单词
把单词截图（或文字）和这句话发给任何 AI 工具：

```
请按照这个仓库的 AGENTS.md 把这些单词加进去：
https://github.com/skot-chen/daily-words
```

AI 会新建一个 `words/日期.json` 文件。大约 1 分钟后，网站上就会出现新的一组单词。

## For developers / AI
See [AGENTS.md](AGENTS.md). `npm run check` validates + builds, `npm run dev` previews locally. No dependencies.
