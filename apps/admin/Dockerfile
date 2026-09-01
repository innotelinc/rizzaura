# ---- build stage: compile the React app into dist/ ----
FROM node:22-alpine AS build
WORKDIR /repo
# Workspace manifests first so `npm ci` installs every workspace's deps.
COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/rankings/package.json apps/rankings/package.json
COPY apps/community/package.json apps/community/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN npm ci
COPY apps ./apps

ARG VITE_API_BASE=https://api.rizzaura.net
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build -w apps/admin

# ---- runtime stage: nginx serves the SPA ----
FROM nginx:1.27-alpine
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
EXPOSE 3013
