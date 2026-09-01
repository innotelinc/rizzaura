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

ARG VITE_API_BASE=https://api.rizz.innotel.us
ENV VITE_API_BASE=$VITE_API_BASE
ARG VITE_BASE_DOMAIN=rizz.innotel.us
ENV VITE_BASE_DOMAIN=$VITE_BASE_DOMAIN
RUN npm run build -w apps/rankings

# ---- runtime stage: nginx serves the SPA ----
FROM nginx:1.27-alpine
COPY apps/rankings/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/rankings/dist /usr/share/nginx/html
EXPOSE 3011
