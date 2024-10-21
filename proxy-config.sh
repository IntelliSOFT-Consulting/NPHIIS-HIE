#!/bin/bash

# prompt the user to enter the domain name
read -p "Enter the domain name: " DOMAIN_NAME


# Check if .env file exists

# Load environment variables from .env file
set -a

mkdir -p proxy

# Create the Nginx configuration file
cat <<EOF >proxy/nginx.conf
worker_processes 1;

events {
    worker_connections 1024;
}

http {

    include /etc/nginx/mime.types;

    server {
        listen 80;
        server_name $DOMAIN_NAME;

        location / {
            return 301 https://\$host\$request_uri;
        }
    }

    server {
        listen 443 ssl;
        server_name $DOMAIN_NAME;

        ssl_certificate_key /opt/star.intellisoftkenya.com.key;
        ssl_certificate /opt/star.intellisoftkenya.com.crt;

        location / {
            if (\$http_referer ~* "/client") {
                rewrite ^/$ /client/ break;
            } 
            if (\$http_referer ~* "/analytics") {
                rewrite ^/$ /analytics/ break;
            } 
            if (\$http_referer ~* "/reports") {
                rewrite ^/$ /reports/ break;
            } 
            if (\$http_referer ~* "/sso") {
                rewrite ^/$ /sso/ break;
            } 
            if (\$http_referer ~* "/pipeline") {
                rewrite ^/$ /pipeline/ break;
            } 
            if (\$http_referer ~* "/chanjo-hapi") {
                rewrite ^/$ /chanjo-hapi/ break;
            }

            proxy_pass http://provider:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$http_host;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_set_header X-Forwarded-Host \$host;
            proxy_set_header X-Forwarded-Server \$host;
            proxy_set_header X-Forwarded-Port \$server_port;
            proxy_set_header Accept-Encoding *;
        }

        location /sso/ {
          proxy_pass http://keycloak:8080/;
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

        location /pipeline/ {
            proxy_pass http://pipeline-controller:8080/;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
            add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
            add_header 'Access-Control-Allow-Credentials' 'true' always;
        }

        location /authentication/ {
        proxy_pass http://chanjoke-auth:3000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location /reports/ {
        proxy_pass http://reports_app:8000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location /chanjo-hapi/ {
        client_max_body_size 60M;
        proxy_pass http://hapi-fhir-jpa:8080/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        }

        location /client/ {
            proxy_pass http://client:3000/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location /analytics/ {
            proxy_pass http://23.239.27.44:8088/;
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
