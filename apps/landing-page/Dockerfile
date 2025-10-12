# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base


# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json（或yarn.lock）到工作目录
COPY package-prod.json ./package.json

# 安装项目依赖
RUN npm config set registry http://192.168.3.43:8081/repository/npm-group/
RUN npm install

# 复制项目文件到工作目录
COPY . .

# 构建Next.js应用
RUN npm run build

# 暴露Next.js应用端口
EXPOSE 3000

# 运行Next.js应用
CMD ["npm", "start"]