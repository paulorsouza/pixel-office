# Game (cliente Phaser) — servido estático pelo nginx.
# Inclui tiled/ e maps/ porque o TiledRuntimeLoader carrega os .tmj em runtime no navegador.
FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
# server.js é o servidor de DEV (watch/reload); não é usado em produção.
RUN rm -f /usr/share/nginx/html/server.js /usr/share/nginx/html/Dockerfile
EXPOSE 80
