#!/bin/bash

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found."
    exit 1
fi

# Load environment variables from .env file
set -a
source .env
set +a

# Check if all required domain variables are set
required_vars=(
    "HAPI_FHIR_DOMAIN"
    "KEYCLOAK_DOMAIN"
    "OPENHIM_DOMAIN"
    "PROVIDER_DOMAIN"
    "CLIENT_DOMAIN"
    "SUPERSET_DOMAIN"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "Error: $var is not set in the .env file."
        exit 1
    fi
done

mkdir -p proxy

# Create the Nginx configuration file
cat << EOF > proxy/nginx.conf
worker_processes 1;

events {
  worker_connections 1024;
}

http {

  server {
    listen 80;
    server_name ${KEYCLOAK_DOMAIN};
    location / {
      return 301 https://\$host\$request_uri;
    }
  }

  server {
    listen 443 ssl;
    server_name ${HAPI_FHIR_DOMAIN};
    ssl_certificate_key /opt/star.intellisoftkenya.com.key;
    ssl_certificate /opt/star.intellisoftkenya.com.crt;
    proxy_ssl_verify off;
    proxy_ssl_verify_depth 1;
    proxy_ssl_session_reuse off;
    location / {
      proxy_pass http://pipeline-controller:8080/;
      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
      add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
      add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
  }

  server {
    listen 80;
    server_name ${OPENHIM_DOMAIN};
    return 301 https://\$server_name\$request_uri;
  }

  server {
    listen 443 ssl;
    server_name ${KEYCLOAK_DOMAIN};
    ssl_certificate_key /opt/star.intellisoftkenya.com.key;
    ssl_certificate /opt/star.intellisoftkenya.com.crt;

    location / {
      resolver 127.0.0.11 valid=30s;

      proxy_pass http://keycloak:8080;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host \$http_host;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header Accept-Encoding *;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-Host \$host;
      proxy_set_header X-Forwarded-Server \$host;
      proxy_set_header X-Forwarded-Port \$server_port;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }
  }

  server {
    listen 443 ssl;
    server_name ${OPENHIM_DOMAIN};
    ssl_certificate_key /opt/star.intellisoftkenya.com.key;
    ssl_certificate /opt/star.intellisoftkenya.com.crt;

    proxy_ssl_verify off;
    proxy_ssl_verify_depth 1;
    proxy_ssl_session_reuse off;
    location / {
      proxy_pass http://openhim-console:80/;
      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
      add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
      add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
    location /mediators {
      if (\$request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin \$http_origin;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
        add_header 'Access-Control-Max-Age' 86400;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header Content-Length 0;
        return 204;
      }
      proxy_pass http://openhim-core:5001/;
      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
      add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
      add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
    location /openhim/ {
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_pass http://openhim-console:80/;
      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
      add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
      add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
    location /openhim-api/ {
      proxy_pass https://openhim-core:8080/;
    }
    location /hapi/ {
      client_max_body_size 60M;
      proxy_pass http://hapi-fhir-jpa:8080/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
      add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
      add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
    location /auth/ {
      proxy_pass http://chanjoke-auth:3000/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_redirect off;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
      add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
      add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
  }

  server {
    listen 80;
    server_name ${CLIENT_DOMAIN};
    return 301 https://\$server_name\$request_uri;
  }

  server {
    listen 443 ssl;
    server_name ${CLIENT_DOMAIN};
    ssl_certificate_key /opt/star.intellisoftkenya.com.key;
    ssl_certificate /opt/star.intellisoftkenya.com.crt;

    location / {
      proxy_pass http://client:3000/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /auth/ {
      proxy_pass http://chanjoke-auth:3000/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /chanjo-hapi/ {
      proxy_pass http://hapi-fhir-jpa:8080/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }
  }

  server {
    listen 80;
    server_name ${PROVIDER_DOMAIN};
    return 301 https://\$server_name\$request_uri;
  }

  server {
    listen 443 ssl;
    server_name ${PROVIDER_DOMAIN};
    ssl_certificate_key /opt/star.intellisoftkenya.com.key;
    ssl_certificate /opt/star.intellisoftkenya.com.crt;

    location / {
      proxy_pass http://provider:8080/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /auth/ {
      proxy_pass http://chanjoke-auth:3000/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /chanjo-hapi/ {
      proxy_pass http://hapi-fhir-jpa:8080/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /openhim/ {
      proxy_pass http://openhim-core:5001/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }
  }

  server {
    listen 80;
    server_name ${SUPERSET_DOMAIN};
    return 301 https://\$server_name\$request_uri;
  }

  server {
    listen 443 ssl;
    server_name ${SUPERSET_DOMAIN};
    ssl_certificate_key /opt/star.intellisoftkenya.com.key;
    ssl_certificate /opt/star.intellisoftkenya.com.crt;

    location / {
      proxy_pass http://superset:8088/;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }
  }
}
EOF

sudo cp ./proxy/nginx.conf ./hie/nginx.conf

echo "Nginx configuration file has been generated as nginx.conf"