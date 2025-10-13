FROM nginx
COPY ./dist/ /usr/share/nginx/html/
COPY ./nginx/nginx.conf /etc/nginx/nginx.conf
COPY ./nginx/kotion.top.key /usr/share/nginx/kotion.top.key
COPY ./nginx/kotion.top.pem /usr/share/nginx/kotion.top.pem

RUN chmod -R 777 /usr/share/nginx/html/

EXPOSE 80


