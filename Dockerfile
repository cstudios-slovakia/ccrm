# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Setup PHP-Apache to run backend and serve frontend
FROM php:8.2-apache

# Use the docker-php-extension-installer to easily and robustly install PHP extensions
ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/

RUN chmod +x /usr/local/bin/install-php-extensions && \
    install-php-extensions imap pdo_mysql zip

# Enable apache rewrite module
RUN a2enmod rewrite

# Copy compiled assets and PHP scripts to document root
COPY --from=builder /app/dist /var/www/html

# Adjust permissions so Apache user (www-data) can write config.php and handle uploads
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
