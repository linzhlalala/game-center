# 🎮 游戏中心

一个纯前端、无广告的小游戏合集，适合给小孩随便玩。打开就能玩，不需要联网、不需要装任何东西、没有任何广告。

首页是一个导航页，以后想加游戏，只要往里面加一张卡片就行。

## 目录结构

```
web/
├── index.html          # 导航首页（游戏列表）
├── home.css            # 首页样式
├── README.md
└── games/
    └── snake-clash/    # 第 1 个游戏
        ├── index.html
        ├── style.css
        ├── game.js
        └── icon.svg    # 原创卡通蛇图标
```

## 怎么运行

### 最简单：直接双击

双击根目录的 `index.html`，用浏览器打开，就能看到游戏列表并进入游戏。

### 推荐：本地起个小服务器

有些浏览器对本地文件有限制，起个小服务器最稳：

```bash
# 有 Python 3
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000

# 或者有 Node.js
npx serve
```

## 怎么加一个新游戏

1. 在 `games/` 下新建一个文件夹，比如 `games/my-game/`，把游戏文件放进去
2. 打开根目录 `index.html`，复制一张现有的游戏卡片，改成新游戏的名字、描述、图标和链接：

```html
<a class="card" href="games/my-game/index.html">
  <div class="card-icon"><img src="games/my-game/icon.svg" alt="图标" /></div>
  <div class="card-body">
    <h2>游戏名字</h2>
    <p>一句话简介。</p>
  </div>
  <span class="card-play">开始 ▶</span>
</a>
```

就这么简单，首页会自动排版。

## 游戏：Snake Clash

参考 Snake Clash.io 玩法做的伪 3D 贪吃蛇：

- 吃食物变长变粗
- 撞到**比你小**的蛇 → 吃掉它；撞到**比你大**的蛇 → 你死
- 别撞红色边界墙
- 操作：鼠标移动 / 手指拖动控制方向

技术上是**纯 Canvas 2D**、零依赖。伪 3D 靠斜俯视角（Y 轴压扁）+ 带高光和落地阴影的球体营造立体感。

### 图标说明

`games/snake-clash/icon.svg` 是**自己用代码画的原创卡通蛇图标**，不是官方素材，可以放心公开使用、不涉及版权问题。

## 部署（免费挂到公网）

这是纯静态网站，随便找个静态托管即可。最省事的排序：

1. **GitHub Pages** — 免费永久、不用绑卡，push 就更新（首推）
2. **Netlify** — 把整个 `web` 文件夹拖进官网即可，连 Git 都不用
3. **Cloudflare Pages** — 免费额度大、全球快
4. **AWS S3 / Amplify** — 也能做，但要注册、绑信用卡、配置更多，适合以后要加后端时再用

部署后，把 `index.html` 所在的根目录作为站点根即可，游戏链接是相对路径，不用改。
