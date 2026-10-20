# 备选方案：自建 nginx 部署

> 当前实际用的是 GitHub Pages，见 `部署.md`。
> 这份保留作为备选记录 —— 如果以后要迁回自建服务器，照这个走。
>
> 放弃自建的原因：服务器内存不足装不上依赖（`npm ci` 报 Exit handler never called）、
> rsync 权限问题、以及域名走 Cloudflare 后 SSL 模式还需额外确认。
> Pages 把这三个问题都绕开了，而且推送即自动部署。

构建产物是纯静态文件（15 个文件、844 KB），nginx 直接托管即可，**不需要 Node 进程、不需要反向代理**。

本文的 nginx 配置已在 nginx:alpine 容器里用真实产物跑过，验证了路由、缓存头、gzip 和浏览器端功能。
---

## 1. DNS

加一条 A 记录指向服务器 IP：

```
tools.starnight.top.  A  <服务器IP>
```

生效后确认：

```bash
dig +short tools.starnight.top
```

## 2. 构建产物

**注意**：`dist/` 在 `.gitignore` 里，服务器上 `git clone` 拿不到产物。两种做法选一个。

### 方案 A：本地构建后上传（推荐）

服务器不需要装 Node，也不占用服务器 CPU。

```bash
# 本地
npm ci
npm run build

# 上传（--delete 会清掉服务器上多余的旧文件）
rsync -avz --delete dist/ root@<服务器IP>:/var/www/tools/
```

### 方案 B：服务器上构建

服务器需要 Node 20.19+ 或 22.12+（Vite 8 的要求）。

```bash
cd /var/www/ToolCollection
git pull
npm ci
npm run build
# 产物在 ./dist，把 nginx 的 root 指到这里，或者 rsync 到 /var/www/tools
```

## 3. 目录与权限

```bash
sudo mkdir -p /var/www/tools
sudo chown -R www-data:www-data /var/www/tools   # Debian/Ubuntu
# CentOS/RHEL 用 nginx:nginx
sudo chmod -R 755 /var/www/tools
```

## 4. nginx 配置

写入 `/etc/nginx/sites-available/tools.starnight.top`（Debian/Ubuntu）
或 `/etc/nginx/conf.d/tools.starnight.top.conf`（CentOS/RHEL）：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tools.starnight.top;

    root /var/www/tools;
    index index.html;

    # 让 301 用相对路径，避免 nginx 拼出的绝对地址丢端口或用错 scheme
    absolute_redirect off;

    # 多页面站点，不是 SPA：找不到就 404，不要回退到 index.html。
    # 回退会把路径写错的请求伪装成首页，问题更难查。
    location / {
        try_files $uri $uri/ =404;
    }

    # 产物文件名带内容哈希（如 notes-toDHupC9.js），可以永久缓存。
    # 别再加 expires 指令 —— 它会额外发一个 Cache-Control，
    # 和下面这行重复，浏览器对重复头的处理并不统一。
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # HTML 文件名不带哈希，必须每次回源校验，
    # 否则发了新版用户还拿着旧 HTML、引用已删除的旧资源。
    location ~* \.html$ {
        add_header Cache-Control "no-cache";
    }

    # 收益很大：最大的包 342 KB → 109 KB
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        application/javascript
        application/json
        image/svg+xml;

    # favicon 是 SVG（/favicon.svg）。老浏览器仍会盲请求 /favicon.ico，
    # 静音它的 404，否则每次访问都写一条日志
    location = /favicon.ico {
        access_log off;
        log_not_found off;
    }
}
```

Debian/Ubuntu 还要建软链：

```bash
sudo ln -s /etc/nginx/sites-available/tools.starnight.top /etc/nginx/sites-enabled/
```

检查并重载：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 5. HTTPS

既然 `mail.` 和 `file.` 已经在跑，certbot 应该装好了：

```bash
sudo certbot --nginx -d tools.starnight.top
```

certbot 会自动改上面的 server 块：加 443 监听、证书路径，并把 80 端口改成 301 跳转。**不用手写这部分。**

确认自动续期：

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

## 6. 验证

```bash
# 三个页面都该是 200
for u in / /tools/notes/ /tools/json-formatter/; do
  curl -s -o /dev/null -w "$u %{http_code}\n" https://tools.starnight.top$u
done

# 不存在的路径该是 404（不是 200 —— 那说明误配了 SPA 回退）
curl -s -o /dev/null -w "404 测试: %{http_code}\n" https://tools.starnight.top/nope/

# gzip 生效
curl -s -o /dev/null -w "gzip: %{size_download} B\n" -H 'Accept-Encoding: gzip' \
  https://tools.starnight.top/assets/$(ls /var/www/tools/assets | grep '^dist-.*\.js$')
```

浏览器里再确认一次：首页两个区块各 2 张卡片、点进便签能新建、点进 JSON 工具能格式化。

---

## 后续更新

```bash
npm run build
rsync -avz --delete dist/ root@<服务器IP>:/var/www/tools/
```

不用重载 nginx。因为 HTML 是 `no-cache`、资源名带哈希，用户刷新就能拿到新版，不会出现「新 HTML 引用旧资源」或反之。

---

## 几个要留意的点

**便签数据绑定在域名上。** 它存在浏览器 localStorage 里，按 origin 隔离。所以：

- `tools.starnight.top` 的便签和 `mail.` / `file.` 不共享，这是对的
- 以后换域名或改路径，旧数据不会跟着过去，得先用工具里的「导出」存一份 JSON
- 换浏览器、换设备也看不到，这是当初选 localStorage 的既定取舍

**`try_files` 不要写 `/index.html` 回退。** 这是多页面站点，不是 SPA。回退会让所有错误路径都返回首页，打字错误变成「页面白屏但状态码 200」，更难排查。

**不要给 `/assets/` 同时写 `expires` 和 `add_header Cache-Control`。** 实测会发出两个 `Cache-Control` 头。

**资源路径是相对的**（`./assets/`、`../../assets/`），所以挂在子目录（比如 `starnight.top/tools/`）也能跑，不用改构建配置。

**favicon 放在 `public/`。** Vite 构建时会把 `public/` 下的文件原样复制到 `dist/` 根目录，所以 `favicon.svg` 会自动跟着产物上传，不用单独处理。
