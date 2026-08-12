plugins {
    java
    id("org.springframework.boot") version "4.1.0"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "alexlog"
version = "0.0.1-SNAPSHOT"
description = "MySQL load and stats POC"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    // the driver and nothing else. no jdbc starter means no Hikari and no DataSource
    runtimeOnly("com.mysql:mysql-connector-j")
    annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")
}

// Language holds Cyrillic and Japanese alphabets. the compiler must be told the encoding
tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}
