FROM php:8.4-apache-bookworm AS application
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql \
    && php -r 'foreach (["pdo_mysql", "simplexml", "mbstring", "curl"] as $extension) { if (!extension_loaded($extension)) { exit(1); } }' \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
WORKDIR /var/www/app
COPY backend/composer.* ./
# Install the PHP storage SDK and application dependencies.
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --no-scripts
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY frontend/public /var/www/html
COPY backend/public /var/www/html
COPY backend/apache.conf /etc/apache2/conf-enabled/department.conf
RUN composer dump-autoload --no-dev --classmap-authoritative \
    && chmod +x /var/www/app/scripts/start.sh
EXPOSE 80
CMD ["/var/www/app/scripts/start.sh"]
