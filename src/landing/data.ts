/**
 * 首页内容。新增工具只改这里 + vite.config.ts 的 input。
 * href 用相对路径，这样部署到子目录也不会挂。
 */

/** 卡片的公共形状：工具和相关链接共用一套样式，只差跳转方式 */
interface CardItem {
  name: string;
  desc: string;
  href: string;
  tags: string[];
  /** 图标 SVG 的 path/内容，viewBox 统一 0 0 24 24 */
  icon: string;
}

export interface Tool extends CardItem {
  soon?: boolean;
}

/** 站外链接。渲染成和工具一样的卡片，只是开新窗口并带外链角标 */
export type Link = CardItem;

export const tools: Tool[] = [
  {
    name: "JSON 格式化 / 对比",
    desc: "格式化与语法高亮，多标签页管理多份 JSON，可任选两个标签做结构化差异对比。",
    href: "tools/json-formatter/index.html",
    tags: ["格式化", "高亮", "多标签", "Diff"],
    icon: `<path d="M8 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h1"/>
           <path d="M16 4h1a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-1"/>`,
  },
  {
    name: "便签集",
    desc: "随手记的便签墙，所见即所得的 Markdown 编辑，支持标签分类、置顶和搜索。数据存在浏览器本地，可导出备份。",
    href: "tools/notes/index.html",
    tags: ["便签", "Markdown", "标签"],
    icon: `<path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z"/>
           <path d="M15 21v-5h5"/><path d="M8 8h7M8 12h5"/>`,
  },
];

export const links: Link[] = [
  {
    name: "邮件服务",
    desc: "自搭建的邮件服务，收发自有域名下的邮件。",
    href: "https://mail.starnight.top",
    tags: ["自建", "邮件"],
    // 信封
    icon: `<rect x="3" y="5" width="18" height="14" rx="2"/>
           <path d="m3.5 6.5 7.3 5.6a2 2 0 0 0 2.4 0l7.3-5.6"/>`,
  },
  {
    name: "文件传输",
    desc: "自搭建的文件传输服务，在设备之间直接传文件。",
    href: "https://file.starnight.top",
    tags: ["自建", "文件"],
    // 云 + 上下箭头
    icon: `<path d="M7 18a4 4 0 0 1-.4-7.98 5.5 5.5 0 0 1 10.6-1.2A3.75 3.75 0 0 1 18 18h-1"/>
           <path d="M12 21V11M9 14l3-3 3 3"/>`,
  },
];
