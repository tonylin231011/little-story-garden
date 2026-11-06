# 跟读评测上线清单

网站继续使用 GitHub Pages。`cloudfunctions/pronunciation` 是独立的腾讯云 CloudBase HTTP 函数，只接收一段录音和对应英文句子，不保存音频或评测结果。

2026-11-06：独立 CloudBase 函数 `pronunciation` 已部署，路由、跨域和家长口令校验已验证。真实请求已到达腾讯云口语评测，但返回 4003（账号尚未开通新版口语评测）。因此 `public/pronunciation.json` 的 `endpoint` 暂时保持为空；网站不会把孩子录音发送到失败的服务，录音后仍会有鼓励与本机回放，不会误称已测得发音标准。

## 上线前核对

1. 在[腾讯云控制台](https://console.cloud.tencent.com/soenew)开通**口语评测（新版）**，确认英文句子模式与独立调用额度；TTS 额度不能抵用。开通可能涉及服务协议或购买，需由账号持有人在控制台完成。
2. 确认 CloudBase 环境 `nanbuqu-dashboard-d0drnae5202324` 续期。2026-11-06 查询时该体验环境显示到期时间为 2026-11-14 23:59:59。
3. CloudBase 函数环境变量已经设置 `TENCENT_APP_ID`、`TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY` 和随机生成的 `STORY_ASSESS_TOKEN`。密钥和口令不得进入 Git 或网页文件。账号 AppID 已通过 CAM `GetUserAppId` 核对为 `1433064673`。
4. Node.js HTTP 函数与 HTTPS 路由已经部署；只为 `pronunciation` 增加了可调用规则，保留其他函数原有登录限制。函数只允许 GitHub Pages 来源及本机调试来源，并校验家长口令；公网来源检查本身不等于身份认证。网关调用限额尚未确认生效。
5. 用真实录音验证 16 kHz 单声道 WAV、签名、腾讯云返回的 `SuggestedScore` 和 `PronCompletion`，测试静音、断网、口令错误和额度耗尽。
6. 将函数 URL 填入 `public/pronunciation.json` 并发布网站。家长在每台平板的家长区输入评测口令一次。

联网评测需要发送孩子的录音及当前英文句子到腾讯云；绘本图片、学习记录不会发送。离线听读与本机录音不依赖这个函数。
