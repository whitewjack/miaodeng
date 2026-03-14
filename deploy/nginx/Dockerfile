FROM nginx:1.27-alpine

RUN apk add --no-cache openssl gettext

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /usr/local/bin/sso-gateway-entrypoint.sh

RUN chmod +x /usr/local/bin/sso-gateway-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/sso-gateway-entrypoint.sh"]
