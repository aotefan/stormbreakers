export type Language = 'zh' | 'en';
export const SITE_URL = 'https://stormbreakers.onrender.com';
export const REPOSITORY_URL = 'https://github.com/aotefan/stormbreakers';
export const siteText = {
  zh: {
    title: '破风者 Stormbreakers｜三分钟海战，开炮就现在！',
    description: '破风者 Stormbreakers 是免费开源的 3D 海战网页游戏。无需注册，支持 AI 练习、最多六人房间、自由海战、风暴生存和宝藏争夺，电脑与手机均可操作。',
    intro: '开船、抢宝、轰沉对手。叫上朋友，三分钟决胜海上。免费开源的 3D 海战网页游戏，无需注册。',
    faqTitle: '关于破风者',
    source: 'GitHub 源码',
    live: '在线游戏',
    faq: [
      ['破风者是什么游戏？', 'Stormbreakers（破风者）是一款免费、MIT 开源的 3D 海战网页游戏，使用 React、TypeScript、Three.js 和 Node.js 开发。无需安装客户端或注册账号；游戏画面需要支持 WebGL 的现代浏览器。'],
      ['怎样与朋友联机？', '点击“创建房间”，把五位房间码发给朋友，朋友输入房间码加入。每个房间最多六名玩家，空位由 AI 操控。每局三分钟，结束后可在原房间再来一局。'],
      ['有哪些游戏模式？', '自由海战以走位和左右舷炮交火为主；风暴生存需要躲避移动水龙卷并积累生存分数；宝藏争夺有更多宝箱和更高的拾取分数。AI 提供简单、普通、困难三档难度。'],
      ['手机能玩吗？', '支持触屏操作：按住自己的船拖动，松开停止；另一根手指按住左右半屏或开炮按钮持续开火。电脑使用 WASD 航行、Q/E 开炮、空格加速、R 修复、F 快速装填。设备需要 WebGL 支持，运行速度取决于硬件与画质。'],
      ['游戏进度会保存吗？', '目前没有账号或持久化存档。联机状态保存在服务器内存中，服务重启后会清空。单机可以暂停，联机比赛会继续运行。空房间会在一分钟后释放。'],
      ['能修改代码或自己部署吗？', '可以。源代码采用 MIT 许可证，可在保留版权和许可声明的前提下使用、修改与分发。GitHub README 提供本地运行和 Render 部署步骤。'],
    ],
  },
  en: {
    title: 'Stormbreakers — 3-Minute Naval Battles. Set Sail & Open Fire!',
    description: 'Play Stormbreakers, a free open-source 3D naval battle browser game. Fight AI or join up to six players in Free Battle, Storm Survival and Treasure Raid. No account needed.',
    intro: 'Set sail. Fire broadsides. Take the treasure. Challenge friends in three-minute naval battles — free, open-source, and right in your browser.',
    faqTitle: 'About Stormbreakers',
    source: 'Source on GitHub',
    live: 'Play online',
    faq: [
      ['What is Stormbreakers?', 'Stormbreakers (破风者) is a free, MIT-licensed 3D naval battle browser game built with React, TypeScript, Three.js and Node.js. No client installation or account is required. A modern browser with WebGL is needed to render the game.'],
      ['How do I play with friends?', 'Choose Create Room and share the five-character room code. Friends enter that code to join. A room supports up to six human players, with AI filling vacant seats. Rounds last three minutes and support a shared rematch.'],
      ['Which modes are available?', 'Free Battle focuses on broadside cannon combat. Storm Survival adds moving waterspouts and survival points. Treasure Raid offers more crates and higher pickup scores. AI has easy, normal and hard difficulty settings.'],
      ['Can I play on a phone?', 'Touch controls are supported: drag your ship to sail and release to stop. Hold a second finger on either half of the sea or a cannon button to fire. On desktop, use WASD to sail, Q/E to fire, Space to boost, R to repair and F to reload. WebGL support is required; performance depends on hardware and quality settings.'],
      ['Is progress saved?', 'There are no accounts or persistent saves. Online game state lives in server memory and resets on a server restart. Solo play can pause; online rounds continue. Empty rooms are released after one minute.'],
      ['Can I modify or self-host the game?', 'Yes. The source is available under the MIT license, which permits use, modification and redistribution while retaining the copyright and license notice. The GitHub README explains local setup and Render deployment.'],
    ],
  },
} as const;
