// AI资源导航数据结构和初始数据

export interface AIResource {
    id: string;
    name: string;
    description: string;
    url: string;
    logoUrl?: string;      // 原始logo URL（用于首次获取）
    localLogo?: string;    // 本地缓存的logo路径
    category: string;
    tags?: string[];
    order?: number;
}

export interface AICategory {
    id: string;
    name: string;
    icon: string;  // lucide图标名称
    order: number;
}

export interface AIResourcesData {
    categories: AICategory[];
    resources: AIResource[];
}

// 预设分类
export const DEFAULT_CATEGORIES: AICategory[] = [
    { id: 'chat', name: 'AI对话', icon: 'MessageSquare', order: 1 },
    { id: 'code', name: '代码开发', icon: 'Code', order: 2 },
    { id: 'image', name: '图像生成', icon: 'Image', order: 3 },
    { id: 'video', name: '视频生成', icon: 'Video', order: 4 },
    { id: 'design', name: '设计工具', icon: 'Palette', order: 5 },
    { id: 'productivity', name: '效率工具', icon: 'Zap', order: 6 },
    { id: 'audio', name: '音频处理', icon: 'Music', order: 7 },
    { id: 'other', name: '其他工具', icon: 'MoreHorizontal', order: 99 },
];

// 预设资源
export const DEFAULT_RESOURCES: AIResource[] = [
    // AI对话
    {
        id: 'chatgpt',
        name: 'ChatGPT',
        description: 'OpenAI的AI对话助手',
        url: 'https://chat.openai.com',
        logoUrl: 'https://chat.openai.com/favicon.ico',
        category: 'chat',
        tags: ['OpenAI', '对话', '写作'],
        order: 1
    },
    {
        id: 'claude',
        name: 'Claude',
        description: 'Anthropic的AI助手',
        url: 'https://claude.ai',
        logoUrl: 'https://claude.ai/favicon.ico',
        category: 'chat',
        tags: ['Anthropic', '对话', '分析'],
        order: 2
    },
    {
        id: 'gemini',
        name: 'Gemini',
        description: 'Google的多模态AI',
        url: 'https://gemini.google.com',
        logoUrl: 'https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030f74c3f.png',
        category: 'chat',
        tags: ['Google', '多模态'],
        order: 3
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        description: '深度求索AI对话',
        url: 'https://chat.deepseek.com',
        logoUrl: 'https://chat.deepseek.com/favicon.ico',
        category: 'chat',
        tags: ['国产', '对话', '代码'],
        order: 4
    },
    {
        id: 'kimi',
        name: 'Kimi',
        description: '月之暗面长文本AI',
        url: 'https://kimi.moonshot.cn',
        logoUrl: 'https://kimi.moonshot.cn/favicon.ico',
        category: 'chat',
        tags: ['国产', '长文本'],
        order: 5
    },
    {
        id: 'doubao',
        name: '豆包',
        description: '字节跳动AI助手',
        url: 'https://www.doubao.com',
        logoUrl: 'https://www.doubao.com/favicon.ico',
        category: 'chat',
        tags: ['国产', '字节'],
        order: 6
    },
    {
        id: 'tongyi',
        name: '通义千问',
        description: '阿里巴巴AI助手',
        url: 'https://tongyi.aliyun.com',
        logoUrl: 'https://img.alicdn.com/imgextra/i1/O1CN01AKUdEM1qP2jykihIU_!!6000000005487-2-tps-512-512.png',
        category: 'chat',
        tags: ['国产', '阿里'],
        order: 7
    },
    {
        id: 'wenxin',
        name: '文心一言',
        description: '百度AI对话',
        url: 'https://yiyan.baidu.com',
        logoUrl: 'https://nlp-eb.cdn.bcebos.com/logo/favicon.ico',
        category: 'chat',
        tags: ['国产', '百度'],
        order: 8
    },

    // 代码开发
    {
        id: 'cursor',
        name: 'Cursor',
        description: 'AI驱动的代码编辑器',
        url: 'https://cursor.sh',
        logoUrl: 'https://cursor.sh/favicon.ico',
        category: 'code',
        tags: ['IDE', '编程'],
        order: 1
    },
    {
        id: 'windsurf',
        name: 'Windsurf',
        description: 'Codeium的AI IDE',
        url: 'https://codeium.com/windsurf',
        logoUrl: 'https://codeium.com/favicon.ico',
        category: 'code',
        tags: ['IDE', '编程'],
        order: 2
    },
    {
        id: 'github-copilot',
        name: 'GitHub Copilot',
        description: 'GitHub AI编程助手',
        url: 'https://github.com/features/copilot',
        logoUrl: 'https://github.githubassets.com/favicons/favicon.svg',
        category: 'code',
        tags: ['GitHub', '编程'],
        order: 3
    },
    {
        id: 'replit',
        name: 'Replit',
        description: '在线AI编程平台',
        url: 'https://replit.com',
        logoUrl: 'https://replit.com/public/icons/favicon-196.png',
        category: 'code',
        tags: ['在线IDE', '协作'],
        order: 4
    },
    {
        id: 'v0',
        name: 'v0.dev',
        description: 'Vercel AI UI生成器',
        url: 'https://v0.dev',
        logoUrl: 'https://v0.dev/favicon.ico',
        category: 'code',
        tags: ['UI', 'React'],
        order: 5
    },

    // 图像生成
    {
        id: 'midjourney',
        name: 'Midjourney',
        description: '顶级AI图像生成',
        url: 'https://www.midjourney.com',
        logoUrl: 'https://www.midjourney.com/favicon.ico',
        category: 'image',
        tags: ['绘画', '艺术'],
        order: 1
    },
    {
        id: 'dalle',
        name: 'DALL-E',
        description: 'OpenAI图像生成',
        url: 'https://openai.com/dall-e-3',
        logoUrl: 'https://openai.com/favicon.ico',
        category: 'image',
        tags: ['OpenAI', '绘画'],
        order: 2
    },
    {
        id: 'stable-diffusion',
        name: 'Stable Diffusion',
        description: '开源图像生成模型',
        url: 'https://stability.ai',
        logoUrl: 'https://stability.ai/favicon.ico',
        category: 'image',
        tags: ['开源', '绘画'],
        order: 3
    },
    {
        id: 'leonardo',
        name: 'Leonardo.AI',
        description: '专业AI绘图平台',
        url: 'https://leonardo.ai',
        logoUrl: 'https://leonardo.ai/favicon.ico',
        category: 'image',
        tags: ['绘画', '设计'],
        order: 4
    },
    {
        id: 'ideogram',
        name: 'Ideogram',
        description: 'AI文字绘图专家',
        url: 'https://ideogram.ai',
        logoUrl: 'https://ideogram.ai/favicon.ico',
        category: 'image',
        tags: ['文字', '绘画'],
        order: 5
    },
    {
        id: 'kling',
        name: '可灵AI',
        description: '快手AI图像视频生成',
        url: 'https://klingai.kuaishou.com',
        logoUrl: 'https://klingai.kuaishou.com/favicon.ico',
        category: 'image',
        tags: ['国产', '快手'],
        order: 6
    },

    // 视频生成
    {
        id: 'runway',
        name: 'Runway',
        description: 'AI视频生成领导者',
        url: 'https://runwayml.com',
        logoUrl: 'https://runwayml.com/favicon.ico',
        category: 'video',
        tags: ['视频', '特效'],
        order: 1
    },
    {
        id: 'pika',
        name: 'Pika',
        description: 'AI视频创作平台',
        url: 'https://pika.art',
        logoUrl: 'https://pika.art/favicon.ico',
        category: 'video',
        tags: ['视频', '动画'],
        order: 2
    },
    {
        id: 'heygen',
        name: 'HeyGen',
        description: 'AI数字人视频',
        url: 'https://www.heygen.com',
        logoUrl: 'https://www.heygen.com/favicon.ico',
        category: 'video',
        tags: ['数字人', '口播'],
        order: 3
    },
    {
        id: 'luma',
        name: 'Luma Dream Machine',
        description: 'AI视频生成',
        url: 'https://lumalabs.ai/dream-machine',
        logoUrl: 'https://lumalabs.ai/favicon.ico',
        category: 'video',
        tags: ['视频', '3D'],
        order: 4
    },

    // 设计工具
    {
        id: 'figma',
        name: 'Figma',
        description: '协作设计工具',
        url: 'https://www.figma.com',
        logoUrl: 'https://static.figma.com/app/icon/1/favicon.ico',
        category: 'design',
        tags: ['UI', '协作'],
        order: 1
    },
    {
        id: 'canva',
        name: 'Canva',
        description: 'AI辅助设计平台',
        url: 'https://www.canva.com',
        logoUrl: 'https://www.canva.com/favicon.ico',
        category: 'design',
        tags: ['设计', '模板'],
        order: 2
    },
    {
        id: 'remove-bg',
        name: 'Remove.bg',
        description: 'AI一键抠图',
        url: 'https://www.remove.bg',
        logoUrl: 'https://www.remove.bg/favicon.ico',
        category: 'design',
        tags: ['抠图', '图片处理'],
        order: 3
    },
    {
        id: 'photoroom',
        name: 'PhotoRoom',
        description: 'AI产品图处理',
        url: 'https://www.photoroom.com',
        logoUrl: 'https://www.photoroom.com/favicon.ico',
        category: 'design',
        tags: ['电商', '图片处理'],
        order: 4
    },

    // 效率工具
    {
        id: 'notion-ai',
        name: 'Notion AI',
        description: 'AI增强的笔记工具',
        url: 'https://www.notion.so',
        logoUrl: 'https://www.notion.so/images/favicon.ico',
        category: 'productivity',
        tags: ['笔记', '协作'],
        order: 1
    },
    {
        id: 'gamma',
        name: 'Gamma',
        description: 'AI演示文稿生成',
        url: 'https://gamma.app',
        logoUrl: 'https://gamma.app/favicon.ico',
        category: 'productivity',
        tags: ['PPT', '演示'],
        order: 2
    },
    {
        id: 'perplexity',
        name: 'Perplexity',
        description: 'AI搜索引擎',
        url: 'https://www.perplexity.ai',
        logoUrl: 'https://www.perplexity.ai/favicon.ico',
        category: 'productivity',
        tags: ['搜索', '研究'],
        order: 3
    },
    {
        id: 'napkin',
        name: 'Napkin AI',
        description: 'AI可视化笔记',
        url: 'https://www.napkin.ai',
        logoUrl: 'https://www.napkin.ai/favicon.ico',
        category: 'productivity',
        tags: ['可视化', '笔记'],
        order: 4
    },

    // 音频处理
    {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        description: 'AI语音合成',
        url: 'https://elevenlabs.io',
        logoUrl: 'https://elevenlabs.io/favicon.ico',
        category: 'audio',
        tags: ['语音', 'TTS'],
        order: 1
    },
    {
        id: 'suno',
        name: 'Suno',
        description: 'AI音乐生成',
        url: 'https://suno.com',
        logoUrl: 'https://suno.com/favicon.ico',
        category: 'audio',
        tags: ['音乐', '创作'],
        order: 2
    },
    {
        id: 'udio',
        name: 'Udio',
        description: 'AI音乐创作平台',
        url: 'https://www.udio.com',
        logoUrl: 'https://www.udio.com/favicon.ico',
        category: 'audio',
        tags: ['音乐', '创作'],
        order: 3
    },
];

// 初始数据
export const INITIAL_AI_RESOURCES: AIResourcesData = {
    categories: DEFAULT_CATEGORIES,
    resources: DEFAULT_RESOURCES
};
