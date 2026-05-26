FROM anapsix/alpine-java:8_server-jre_unlimited

RUN mkdir -p /knowledge/agent-skills

WORKDIR /knowledge/agent-skills

EXPOSE 7780

ADD target/knowledge-agent-skills.jar ./app.jar

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom","-Duser.timezone=GMT+8","-jar", "app.jar"]

CMD ["--spring.profiles.active=test"]
