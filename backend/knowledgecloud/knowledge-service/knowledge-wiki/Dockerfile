FROM anapsix/alpine-java:8_server-jre_unlimited

RUN mkdir -p /knowledge/wiki

WORKDIR /knowledge/wiki

EXPOSE 7778

ADD target/knowledge-wiki.jar ./app.jar

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom","-Duser.timezone=GMT+8","-jar", "app.jar"]

CMD ["--spring.profiles.active=test"]
