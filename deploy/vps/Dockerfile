# Production PHP/Apache image for a VPS install.
#
# Unlike the repo-root Dockerfile (dev only: builds the frontend inside the image
# and bakes in dist/), this image carries NO application code. The docroot is the
# git checkout bind-mounted at /var/www/html, because that is how CCRM is
# deployed everywhere: `php ccrm update` pulls, publishes dist/ over the docroot
# and migrates. The image only supplies the runtime that command needs.
FROM php:8.3-apache

ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions \
 && install-php-extensions imap pdo_mysql zip intl gmp bcmath opcache

# git + ssh: `php ccrm update` shells out to git. mysqldump: scripts/backup/db_backup.php.
# curl: the container-side cron tick. unzip: composer prefers it for dist archives.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client unzip curl default-mysql-client \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# .htaccess files must take effect: they carry the config.php / .git / uploads
# guards and the security headers. remoteip restores the real client address
# behind Caddy (login throttling keys on REMOTE_ADDR).
RUN a2enmod rewrite headers remoteip expires
COPY apache-ccrm.conf /etc/apache2/conf-available/ccrm.conf
RUN a2enconf ccrm && a2disconf other-vhosts-access-log || true

COPY php.ini /usr/local/etc/php/conf.d/zz-ccrm.ini

# `git pull` runs as www-data, whose home is /var/www; the deploy key is mounted
# at /var/www/.ssh by docker-compose.yml.
ENV COMPOSER_HOME=/tmp/composer

WORKDIR /var/www/html
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS -o /dev/null -H 'Host: localhost' http://127.0.0.1/ || exit 1
