FROM anapsix/alpine-java:8_server-jre_unlimited

RUN mkdir -p /knowledge/file-center

WORKDIR /knowledge/file-center

EXPOSE 7004

ADD target/knowledge-file-center.jar ./app.jar

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom","-Duser.timezone=GMT+8","-jar", "app.jar"]

CMD ["--spring.profiles.active=test"]
