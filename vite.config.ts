import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/**
 * 多页面构建：每个工具一个独立入口，各自打包。
 * 首页只加载首页的代码，进到某个工具才加载它的依赖（CodeMirror 等）。
 *
 * 新增工具时，在 build.rollupOptions.input 里加一行即可。
 */
export default defineConfig({
  // 相对路径：部署到域名根目录或任意子目录都能跑，不用改配置
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      // Vite 会把以 / 开头的别名按项目根目录解析，不需要 node:path
      "@": "/src",
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        index: "index.html",
        "json-formatter": "tools/json-formatter/index.html",
        notes: "tools/notes/index.html",
      },
    },
  },
});
