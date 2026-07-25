plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val androidSigningEnvironment = mapOf(
    "storeFile" to System.getenv("NEXORA_ANDROID_KEYSTORE_PATH"),
    "storePassword" to System.getenv("NEXORA_ANDROID_KEYSTORE_PASSWORD"),
    "keyAlias" to System.getenv("NEXORA_ANDROID_KEY_ALIAS"),
    "keyPassword" to System.getenv("NEXORA_ANDROID_KEY_PASSWORD"),
)
val hasCompleteAndroidSigning = androidSigningEnvironment.values.all { !it.isNullOrBlank() }
val requireAndroidSigning = providers.gradleProperty("nexoraRequireSigning").orNull?.toBooleanStrictOrNull() ?: false

if (requireAndroidSigning && !hasCompleteAndroidSigning) {
    throw GradleException("Nexora Android release signing is required but the keystore path, passwords or key alias are incomplete.")
}

android {
    namespace = "com.nexora.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.nexora.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 30500
        versionName = "3.5.0"
    }

    signingConfigs {
        if (hasCompleteAndroidSigning) {
            create("release") {
                storeFile = file(androidSigningEnvironment.getValue("storeFile")!!)
                storePassword = androidSigningEnvironment.getValue("storePassword")
                keyAlias = androidSigningEnvironment.getValue("keyAlias")
                keyPassword = androidSigningEnvironment.getValue("keyPassword")
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasCompleteAndroidSigning) signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
