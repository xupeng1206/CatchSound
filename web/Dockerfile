# 构建阶段
FROM node:18-alpine as build

WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装所有依赖（包括开发依赖，构建需要）
RUN npm ci

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 生产阶段
FROM nginx:alpine

# 复制构建的文件到nginx目录
COPY --from=build /app/dist /usr/share/nginx/html
