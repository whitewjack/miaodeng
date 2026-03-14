#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
CERT_FILE="${CERT_DIR}/selfsigned.crt"
KEY_FILE="${CERT_DIR}/selfsigned.key"

UPSTREAM_HOST="${UPSTREAM_HOST:-sso-portal}"
UPSTREAM_PORT="${UPSTREAM_PORT:-6680}"
TLS_DOMAINS="${TLS_DOMAINS:-localhost 127.0.0.1}"
TLS_CERT_DAYS="${TLS_CERT_DAYS:-825}"

mkdir -p "${CERT_DIR}"

if [ ! -s "${CERT_FILE}" ] || [ ! -s "${KEY_FILE}" ]; then
  PRIMARY_DOMAIN="$(printf "%s" "${TLS_DOMAINS}" | awk '{print $1}')"
  ALT_NAMES_FILE="/tmp/openssl-alt-names.txt"
  : > "${ALT_NAMES_FILE}"

  idx=1
  for host in ${TLS_DOMAINS}; do
    case "${host}" in
      '' ) ;;
      *[!0-9.]* ) printf "DNS.%s = %s\n" "${idx}" "${host}" >> "${ALT_NAMES_FILE}" ;;
      * ) printf "IP.%s = %s\n" "${idx}" "${host}" >> "${ALT_NAMES_FILE}" ;;
    esac
    idx=$((idx + 1))
  done

  cat >/tmp/openssl.cnf <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_req
distinguished_name = dn

[dn]
CN = ${PRIMARY_DOMAIN}

[v3_req]
subjectAltName = @alt_names

[alt_names]
$(cat "${ALT_NAMES_FILE}")
EOF

  openssl req -x509 -nodes -newkey rsa:2048 \
    -days "${TLS_CERT_DAYS}" \
    -keyout "${KEY_FILE}" \
    -out "${CERT_FILE}" \
    -config /tmp/openssl.cnf \
    >/dev/null 2>&1
fi

export UPSTREAM_HOST UPSTREAM_PORT
envsubst '${UPSTREAM_HOST} ${UPSTREAM_PORT}' \
  </etc/nginx/templates/default.conf.template \
  >/etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
