# 构建阶段：基于 Node 安装依赖并构建项目
FROM node:18-alpine AS build
WORKDIR /app

# 复制依赖清单（利用 Docker 缓存，加速后续构建）
COPY package.json package-lock.json ./
RUN npm ci  # 生产环境用 ci 替代 install，保证依赖版本一致

# 复制全部项目文件（注意：.dockerignore 需排除无关文件）
COPY . .

# 执行构建并打印目录，确认产物是否生成
RUN npm run build && \
    echo "=== 构建后 /app 目录结构 ===" && \
    ls -la /app && \
    echo "=== .next/server/app 子目录（关键静态文件） ===" && \
    ls -la /app/.next/server/app && \
    echo "=== 结束 ==="

# 部署阶段：基于 Nginx 托管静态文件
FROM nginx:alpine

# 删除 Nginx 默认静态文件（避免与 Next.js 产物冲突）
RUN rm -rf /usr/share/nginx/html/*

# 关键修正：复制 Next.js 静态生成的 index.html 到 Nginx 根目录
COPY --from=build /app/.next/server/app/index.html /usr/share/nginx/html/index.html

# 复制其他静态资源（.next/static、public 等）
COPY --from=build /app/.next/static /usr/share/nginx/html/.next/static
COPY --from=build /app/public /usr/share/nginx/html/public

# 复制自定义 Nginx 配置（确保适配 Next.js 路由）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口（Nginx 监听 80 端口）
EXPOSE 80

# 启动 Nginx（前台运行，保证容器不退出）
CMD ["nginx", "-g", "daemon off;"]