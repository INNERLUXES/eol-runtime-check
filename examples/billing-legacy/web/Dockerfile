FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev

FROM php:7.4-apache
COPY --from=vendor /app/vendor /var/www/html/vendor
COPY . /var/www/html
