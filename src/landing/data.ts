/**
 * 首页内容。新增工具只改这里 + vite.config.ts 的 input。
 * href 用相对路径，这样部署到子目录也不会挂。
 */

export interface Tool {
  name: string;
  desc: string;
  href: string;
  tags: string[];
  /** 图标 SVG 的 path/内容，viewBox 统一 0 0 24 24 */
  icon: string;
  soon?: boolean;
}

export interface Link {
  name: string;
  desc: string;
  href: string;
}

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
    desc: "随手记的便签墙，支持 Markdown 渲染、置顶、颜色标记和搜索。数据存在浏览器本地，可导出备份。",
    href: "tools/notes/index.html",
    tags: ["便签", "Markdown", "本地存储"],
    icon: `<path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2Z"/>
           <path d="M15 21v-5h5"/><path d="M8 8h7M8 12h5"/>`,
  },
];

export const links: Link[] = [
  {
    name: "JSON 官方介绍",
    desc: "数据格式说明",
    href: "https://www.json.org/json-zh.html",
  },
  {
    name: "RFC 8259",
    desc: "JSON 交换格式标准",
    href: "https://datatracker.ietf.org/doc/html/rfc8259",
  },
  {
    name: "MDN · JSON",
    desc: "JS API 参考",
    href: "https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/JSON",
  },
  {
    name: "JSON Schema",
    desc: "结构校验规范",
    href: "https://json-schema.org/",
  },
  {
    name: "JMESPath",
    desc: "JSON 查询表达式",
    href: "https://jmespath.org/",
  },
  {
    name: "regex101",
    desc: "正则在线调试",
    href: "https://regex101.com/",
  },
  {
    name: "Can I use",
    desc: "浏览器兼容性查询",
    href: "https://caniuse.com/",
  },
  {
    name: "MDN Web Docs",
    desc: "Web 技术文档",
    href: "https://developer.mozilla.org/zh-CN/",
  },
];
