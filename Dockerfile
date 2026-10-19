# CloudDroid application image.
#
# This image builds and serves the CloudDroid web app (dashboard, API,
# streaming gateway). The Android runtime itself is intentionally NOT baked
# into the image: run the app next to a host that exposes either a managed AVD
# (ANDROID_HOME + /dev/kvm) or an external adb device (CLOUDDROID_PROVIDER=external).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/shared ./shared
RUN mkdir -p var/storage var/logs var/run var/uploads
EXPOSE 3000
CMD ["node", "dist/server/src/index.js"]
