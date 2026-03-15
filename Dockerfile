FROM python:3.11-slim

ARG APP_VERSION=3.62
LABEL org.opencontainers.image.title="sso-portal" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.description="秒登 MiaoDeng 自动登录门户与插件服务" \
      org.opencontainers.image.source="local-worktree"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=6680 \
    APP_VERSION=${APP_VERSION}

WORKDIR /app

COPY . /app

RUN useradd -m -u 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 6680
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:6680/api/user/check', timeout=3).getcode()==200 else 1)"

CMD ["python", "server.py"]
