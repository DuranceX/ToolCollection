<script setup lang="ts">
import ThemeToggle from "../shared/components/ThemeToggle.vue";
import ItemCard from "./ItemCard.vue";
import { tools, links } from "./data";
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

      <div class="card-grid">
        <ItemCard v-for="tool in tools" :key="tool.href" v-bind="tool" />
      </div>
    </section>

    <!-- 相关链接 -->
    <section class="section" aria-labelledby="links-heading">
      <div class="section-head">
        <h2 id="links-heading">相关链接</h2>
        <span class="count">{{ links.length }} 个</span>
      </div>

      <div class="card-grid">
        <ItemCard v-for="link in links" :key="link.href" v-bind="link" external />
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container">纯前端实现，数据只留在你的浏览器里。</div>
  </footer>
</template>
