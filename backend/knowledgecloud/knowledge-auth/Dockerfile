FROM anapsix/alpine-java:8_server-jre_unlimited

MAINTAINER smallchill@163.com

RUN mkdir -p /knowledge/auth

WORKDIR /knowledge/auth

EXPOSE 8010

ADD ./target/knowledge-auth.jar ./app.jar

ENTRYPOINT ["java", "-jar", "app.jar"]

CMD ["--spring.profiles.active=test"]
