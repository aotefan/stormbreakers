# 破风者 Stormbreakers｜三分钟海战，开炮就现在！

**免费开源的 3D 海战网页游戏。** 驾船走位、左右舷炮交火、躲避水龙卷、争夺宝藏。每局三分钟，支持 AI 练习与最多六人联机。

**[立即在线玩 →](https://stormbreakers.onrender.com/)** · [English README](README.md) · [反馈问题](https://github.com/aotefan/stormbreakers/issues)

![破风者海战实机画面](public/social-preview.png)

## 怎么玩

打开 **https://stormbreakers.onrender.com/**，无需安装或注册。浏览器需要启用 JavaScript 并支持 WebGL。选择“人机练习”，或“创建房间”后把五位房间码发给朋友；空位由 AI 操控。Render 免费服务休眠后首次打开可能较慢。

- **自由海战**：通过走位与左右舷火炮击沉对手。
- **风暴生存**：避开移动水龙卷，积累生存分数。
- **宝藏争夺**：抢夺更多、价值更高的宝箱。
- **五位 AI 船长**：奥特凡、黄仁勋、马斯克、达里奥、TIBO；可选简单、普通、困难。
- **补给与破损**：仅玩家能拾取补给，最高五枚爆破弹齐射；强化持续 15 秒，再拾取刷新。船体破损与掉血对应，支持修复、沉没与重生。

| 操作 | 电脑 | 触屏 |
| --- | --- | --- |
| 航行 | WASD | 按住自己的船拖动，松开停止 |
| 左右舷开炮 | 按住 Q / E | 按住开炮按钮，或拖船时用第二根手指按住左右半屏 |
| 冲刺 / 修复 / 装填 | 空格 / R / F | 对应技能按钮 |

单机暂停会冻结游戏；联机比赛在菜单打开时仍继续。结束后可在同房间再来一局。没有账号和持久化存档；服务器重启会清空联机状态，空房间一分钟后释放。

## 本地运行

使用仍受维护且已安装最新安全补丁的 Node.js 24 LTS。当前基线是 **24.22.1**，对应 2026-10-21 官方安全更新；后续部署前重新核对官方公告。

```bash
git clone https://github.com/aotefan/stormbreakers.git
cd stormbreakers
nvm install
nvm use
npm ci
npm run build
npm start
```

访问 **http://localhost:8787**。不使用 nvm 时，可用其他方式安装相同 Node 版本。开发模式运行 `npm run dev`，访问 **http://localhost:5173**。

技术栈为 React、TypeScript、Three.js、Node.js 和 WebSocket。`src/ui` 管界面，`src/three` 管画面，`src/game` 管输入与会话，`shared` 管规则，`server` 管联机权威模拟。

## 部署、验证和参与

Render 需要 **Node Web Service**。构建命令 `npm ci --include=dev && npm run build`，启动命令 `npm start`，健康检查 `/healthz`；`NODE_ENV=production`，`NODE_VERSION=24.22.1` 或更新的安全 24.x 补丁版。已有的手工配置服务还需在 Render 控制台更新环境变量，不能只改 YAML。通过 `/healthz` 的 `X-Runtime-Version` 响应头核对实际版本。

运行 `npx playwright install chromium` 后执行 `npm test`，依赖安全检查用 `npm audit`。手机测试使用浏览器触屏模拟，不能视为实机 iOS 验证。

首页和 `/en/` 均预渲染真实介绍、操作和 FAQ；提供 canonical、hreflang、社交分享图、JSON-LD、robots.txt、站点地图和补充性 llms.txt。搜索收录、排名及 AI 引用效果需要上线后观察。

完整部署和测试说明见 [英文 README](README.md)，协作流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。代码采用 [MIT 许可证](LICENSE)。
