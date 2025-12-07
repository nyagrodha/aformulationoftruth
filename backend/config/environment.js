/**
 * Central Configuration Module
 *
 * This module loads and validates all environment variables in one place,
 * providing type-safe access to configuration throughout the application.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
/**
 * Throws an error if a required environment variable is missing
 */
function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
/**
 * Gets an optional environment variable with a default value
 */
function optionalEnv(key, defaultValue) {
    return process.env[key] || defaultValue;
}
/**
 * Gets an optional boolean environment variable
 */
function booleanEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined)
        return defaultValue;
    return value === 'true' || value === '1';
}
/**
 * Gets an optional integer environment variable
 */
function intEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined)
        return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        console.warn(`⚠️  Invalid integer for ${key}, using default: ${defaultValue}`);
        return defaultValue;
    }
    return parsed;
}
/**
 * Application Configuration
 */
export const config = {
    // Project Information
    project: {
        name: optionalEnv('PROJECT_NAME', 'aformulationoftruth'),
        environment: optionalEnv('ENVIRONMENT', 'development'),
        nodeEnv: optionalEnv('NODE_ENV', 'development'),
    },
    // Server Configuration
    server: {
        port: intEnv('PORT', 5742),
        host: optionalEnv('HOST', '0.0.0.0'),
        baseUrl: optionalEnv('BASE_URL', 'https://aformulationoftruth.com'),
        apiBaseUrl: optionalEnv('API_BASE_URL', 'http://localhost:5742'),
        frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),
        trustProxy: booleanEnv('TRUST_PROXY', true),
    },
    // Database Configuration
    database: {
        // Parse DATABASE_URL if available, otherwise use individual vars
        url: process.env.DATABASE_URL,
        host: optionalEnv('PG_HOST', optionalEnv('DB_HOST', '10.99.0.1')),
        port: intEnv('PG_PORT', intEnv('DB_PORT', 5432)),
        database: optionalEnv('PG_DATABASE', optionalEnv('DB_NAME', 'a4m_db')),
        user: optionalEnv('PG_USER', optionalEnv('DB_USER', 'a4m_app')),
        password: optionalEnv('PG_PASSWORD', optionalEnv('DB_PASSWORD', '')),
        ssl: booleanEnv('DB_SSL', false),
        pool: {
            min: intEnv('DB_POOL_MIN', 2),
            max: intEnv('DB_POOL_MAX', 20),
        },
    },
    // Redis Configuration
    redis: {
        url: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
        password: process.env.REDIS_PASSWORD,
        sessionDb: intEnv('REDIS_SESSION_DB', 0),
        cacheDb: intEnv('REDIS_CACHE_DB', 1),
        notificationsDb: intEnv('REDIS_NOTIFICATIONS_DB', 2),
    },
    // Authentication & Security
    auth: {
        jwtSecret: requireEnv('JWT_SECRET'),
        jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH,
        jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH,
        encryptionKey: process.env.ENCRYPTION_KEY,
        jwtExpiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),
        refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
        sessionSecret: process.env.SESSION_SECRET,
        bcryptSaltRounds: intEnv('BCRYPT_SALT_ROUNDS', 12),
    },
    // CORS & Security Headers
    cors: {
        origin: optionalEnv('CORS_ORIGIN', 'http://localhost:3000'),
        credentials: booleanEnv('CORS_CREDENTIALS', true),
    },
    // Rate Limiting
    rateLimit: {
        windowMs: intEnv('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
        maxRequests: intEnv('RATE_LIMIT_MAX_REQUESTS', 100),
    },
    // Email Configuration
    email: {
        // SendGrid (for regular users)
        sendgrid: {
            apiKey: process.env.SENDGRID_API_KEY,
            fromEmail: optionalEnv('SENDGRID_FROM_EMAIL', 'noreply@aformulationoftruth.com'),
            fromName: optionalEnv('SENDGRID_FROM_NAME', 'A Formulation of Truth'),
        },
        // SMTP (for admin emails)
        smtp: {
            host: process.env.SMTP_HOST,
            port: intEnv('SMTP_PORT', 587),
            secure: booleanEnv('SMTP_SECURE', false),
            user: process.env.SMTP_USER,
            password: process.env.SMTP_PASS,
            fromEmail: optionalEnv('FROM_EMAIL', 'formitselfisemptiness@aformulationoftruth.com'),
            fromName: optionalEnv('FROM_NAME', 'Karuppacāmi Nirmeyappōr'),
        },
        // Admin configuration
        adminEmails: optionalEnv('ADMIN_EMAILS', 'root@aformulationoftruth.com').split(',').map(e => e.trim()),
        adminEmail: optionalEnv('ADMIN_EMAIL', 'marcel@aformulationoftruth.com'),
    },
    // IP Geolocation
    ipGeolocation: {
        ipinfoToken: process.env.IPINFO_TOKEN,
    },
    // File Storage
    storage: {
        type: optionalEnv('STORAGE_TYPE', 'local'),
        uploadPath: optionalEnv('UPLOAD_PATH', './uploads'),
        maxFileSize: intEnv('MAX_FILE_SIZE', 5242880), // 5MB
    },
    // Search Configuration
    search: {
        engine: optionalEnv('SEARCH_ENGINE', 'postgresql'),
        elasticsearchUrl: process.env.ELASTICSEARCH_URL,
        elasticsearchIndex: optionalEnv('ELASTICSEARCH_INDEX', 'proust_search'),
    },
    // Questionnaire Configuration
    questionnaire: {
        version: optionalEnv('PROUST_QUESTIONS_VERSION', '1.0'),
        requireAll: booleanEnv('REQUIRE_ALL_QUESTIONS', false),
        allowUpdates: booleanEnv('ALLOW_QUESTION_UPDATES', true),
        updateCooldownDays: intEnv('UPDATE_COOLDOWN_DAYS', 30),
    },
    // Analytics & Monitoring (Google Analytics removed, placeholder for Plausible)
    analytics: {
        plausibleDomain: process.env.PLAUSIBLE_DOMAIN,
        plausibleApiUrl: optionalEnv('PLAUSIBLE_API_URL', 'https://plausible.io'),
        sentryDsn: process.env.SENTRY_DSN,
        enabled: booleanEnv('ENABLE_ANALYTICS', true),
    },
    // External APIs
    externalApis: {
        twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            phoneNumber: process.env.TWILIO_PHONE_NUMBER,
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY,
        },
        perspective: {
            apiKey: process.env.PERSPECTIVE_API_KEY,
        },
    },
    // Notifications
    notifications: {
        emailEnabled: booleanEnv('ENABLE_EMAIL_NOTIFICATIONS', true),
        pushEnabled: booleanEnv('ENABLE_PUSH_NOTIFICATIONS', false),
        queueEnabled: booleanEnv('NOTIFICATION_QUEUE_ENABLED', true),
    },
    // Content Moderation
    moderation: {
        enabled: booleanEnv('ENABLE_CONTENT_MODERATION', false),
        autoModerateEnabled: booleanEnv('AUTO_MODERATE_ENABLED', false),
        profanityFilterEnabled: booleanEnv('PROFANITY_FILTER_ENABLED', false),
    },
    // Social Login
    socialLogin: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
        facebook: {
            appId: process.env.FACEBOOK_APP_ID,
            appSecret: process.env.FACEBOOK_APP_SECRET,
        },
    },
    // Keybase Bot
    keybase: {
        username: process.env.KEYBASE_USERNAME,
        paperKey: process.env.KEYBASE_PAPER_KEY,
    },
    // Logging
    logging: {
        level: optionalEnv('LOG_LEVEL', 'info'),
        debug: booleanEnv('DEBUG', false),
    },
};
/**
 * Validate critical configuration on startup
 */
export function validateConfig() {
    const errors = [];
    // Check critical secrets
    if (!config.auth.jwtSecret) {
        errors.push('JWT_SECRET is required');
    }
    if (!config.database.password && !config.database.url) {
        console.warn('⚠️  WARNING: No database password set. This is not secure for production.');
    }
    // Validate email configuration
    if (config.notifications.emailEnabled) {
        if (!config.email.sendgrid.apiKey && !config.email.smtp.host) {
            errors.push('Email notifications enabled but no email provider configured (SendGrid or SMTP)');
        }
    }
    // Validate Twilio if used
    if (config.externalApis.twilio.accountSid && !config.externalApis.twilio.authToken) {
        errors.push('TWILIO_ACCOUNT_SID set but TWILIO_AUTH_TOKEN is missing');
    }
    if (errors.length > 0) {
        console.error('❌ Configuration validation failed:');
        errors.forEach(error => console.error(`   - ${error}`));
        throw new Error('Configuration validation failed');
    }
    console.log('✅ Configuration validated successfully');
}
/**
 * Check if running in production
 */
export function isProduction() {
    return config.project.nodeEnv === 'production';
}
/**
 * Check if running in development
 */
export function isDevelopment() {
    return config.project.nodeEnv === 'development';
}
/**
 * Check if running in test
 */
export function isTest() {
    return config.project.nodeEnv === 'test';
}
export default config;
