# 构建阶段：基于 Node 安装依赖并构建项目
FROM node:18-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci && npm cache clean --force

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/public/ /usr/share/nginx/html/
COPY --from=build /app/.next/static /usr/share/nginx/html/.next/static

COPY --from=build /app/.next/server/app/index.html /usr/share/nginx/html/index.html

# 暴露 Nginx 监听的 80 端口。
EXPOSE 8090

# 启动 Nginx 服务，并使用 'daemon off;' 参数使其在前台运行，这是容器化部署的标准做法。
CMD ["nginx", "-g", "daemon off;"]
