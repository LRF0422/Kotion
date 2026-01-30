FROM nginx
COPY ./dist/ /usr/share/nginx/html/
COPY ./nginx/nginx.conf /etc/nginx/nginx.conf

RUN chmod -R 777 /usr/share/nginx/html/

EXPOSE 80


