<script setup lang="ts">
import ThemeToggle from "../shared/components/ThemeToggle.vue";
import { tools, links } from "./data";

const EXT_ICON = `<path d="M7 17 17 7M17 7H9M17 7v8"/>`;
</script>

<template>
  <header class="topbar">
    <div class="container topbar-inner">
      <a class="brand" href="index.html">
        <span class="brand-mark" aria-hidden="true">TC</span>
        <span>Tool Collection</span>
      </a>
      <div class="topbar-spacer"></div>
      <ThemeToggle />
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <h1>前端小工具集</h1>
      <p>一组按需加载的小工具，所有处理都在浏览器本地完成，不上传任何数据。</p>
    </section>

    <!-- 工具列表 -->
    <section class="section" aria-labelledby="tools-heading">
      <div class="section-head">
        <h2 id="tools-heading">工具列表</h2>
        <span class="count">{{ tools.length }} 个</span>
      </div>

      <div class="tool-grid">
        <component
          :is="tool.soon ? 'div' : 'a'"
          v-for="tool in tools"
          :key="tool.name"
          class="card"
          :class="{ 'card-soon': tool.soon }"
          :href="tool.soon ? undefined : tool.href"
        >
          <div class="card-top">
            <span class="card-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                v-html="tool.icon"
              />
            </span>
            <h3>{{ tool.name }}</h3>
          </div>
          <p>{{ tool.desc }}</p>
          <div class="card-tags">
            <span v-for="tag in tool.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </component>
      </div>
    </section>

    <!-- 相关链接 -->
    <section class="section" aria-labelledby="links-heading">
      <div class="section-head">
        <h2 id="links-heading">相关链接</h2>
      </div>

      <div class="link-list">
        <a
          v-for="link in links"
          :key="link.href"
          class="link-item"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="name">{{ link.name }}</span>
          <span class="desc">{{ link.desc }}</span>
          <svg
            class="ext"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            v-html="EXT_ICON"
          />
        </a>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container">纯前端实现，数据只留在你的浏览器里。</div>
  </footer>
</template>
