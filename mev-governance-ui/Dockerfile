FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV CI=false
RUN npm run build

FROM nginx:alpine
# openssl: per generare il certificato HTTPS autofirmato quando non ne viene montato uno (vedi entrypoint.sh)
RUN apk add --no-cache openssl
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80 8443
CMD ["/entrypoint.sh"]
