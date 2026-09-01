# ---- build stage: compile the React app into dist/ ----
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci
COPY apps ./apps

ARG VITE_API_BASE=https://api.rizzaura.net
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build -w apps/community

# ---- runtime stage: nginx serves the SPA ----
FROM nginx:1.27-alpine
COPY apps/community/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/community/dist /usr/share/nginx/html
EXPOSE 3012
