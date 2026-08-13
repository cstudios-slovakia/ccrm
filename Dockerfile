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

# Enable apache rewrite and headers modules, and let the checked-in .htaccess
# files actually take effect. Without AllowOverride the container ignores both
# the docroot guard and uploads/.htaccess, so security headers that shape how
# the browser treats an attachment (nosniff, CSP) behave differently here than
# on the shared hosting that serves production — which is exactly the class of
# bug that is hardest to reproduce locally.
RUN a2enmod rewrite headers && \
    printf '<Directory /var/www/html>\n    AllowOverride All\n</Directory>\n' \
      > /etc/apache2/conf-available/ccrm-htaccess.conf && \
    a2enconf ccrm-htaccess

# Copy compiled assets and PHP scripts to document root
COPY --from=builder /app/dist /var/www/html

# Adjust permissions so Apache user (www-data) can write config.php and handle uploads
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
