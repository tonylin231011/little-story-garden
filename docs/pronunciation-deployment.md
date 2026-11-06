# 跟读评测上线清单

网站继续使用 GitHub Pages。`cloudfunctions/pronunciation` 是独立的腾讯云 CloudBase HTTP 函数，只接收一段录音和对应英文句子，不保存音频或评测结果。

当前 `public/pronunciation.json` 的 `endpoint` 为空，真实评测尚未启用。孩子录音后会看到鼓励和“评测服务尚未连接”，不会误称已测得发音标准。

## 上线前核对

1. 在腾讯云控制台开通**口语评测（新版）**，确认英文句子模式与独立调用额度；TTS 额度不能抵用。
2. 确认 CloudBase 环境 `nanbuqu-dashboard-d0drnae5202324` 续期。2026-11-06 查询时该体验环境显示到期时间为 2026-11-14 23:59:59。
3. 用 CloudBase 函数环境变量提供 `TENCENT_APP_ID`、`TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY` 和随机生成的 `STORY_ASSESS_TOKEN`。密钥和口令不得进入 Git 或网页文件。账号 AppID 已通过 CAM `GetUserAppId` 核对为 `1433064673`。
4. 部署 Node.js HTTP 函数并设置 HTTPS 公网访问、允许所需调用者的函数安全规则、跨域来源和调用限额。函数只允许 GitHub Pages 来源及本机调试来源，并校验家长口令；公网来源检查本身不等于身份认证。
5. 用真实录音验证 16 kHz 单声道 WAV、签名、腾讯云返回的 `SuggestedScore` 和 `PronCompletion`，测试静音、断网、口令错误和额度耗尽。
6. 将函数 URL 填入 `public/pronunciation.json` 并发布网站。家长在每台平板的家长区输入评测口令一次。

联网评测需要发送孩子的录音及当前英文句子到腾讯云；绘本图片、学习记录不会发送。离线听读与本机录音不依赖这个函数。
