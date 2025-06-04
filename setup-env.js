#!/usr/bin/env node

/**
 * Environment Setup Helper
 * 
 * This script helps set up your .env file with proper validation
 * Run with: node setup-env.js
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

console.log('🔧 Billing Portal Environment Setup\n');

// Check if .env already exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists!');
  console.log('   Review the existing file and update manually if needed.\n');
  console.log('📖 Environment Variable Guide:');
  printEnvironmentGuide();
  process.exit(0);
}

console.log('📝 Creating .env file from template...\n');

// Read template
const templatePath = path.join(__dirname, 'env.example');
let envContent = fs.readFileSync(templatePath, 'utf8');

// Generate secure JWT secret
const jwtSecret = crypto.randomBytes(64).toString('hex');
envContent = envContent.replace('your_very_long_random_jwt_secret_here', jwtSecret);

// Generate secure admin secret
const adminSecret = crypto.randomBytes(32).toString('hex');
envContent = envContent.replace('your_admin_secret_token_here_min_32_chars', adminSecret);

// Write .env file
fs.writeFileSync(envPath, envContent);

console.log('✅ .env file created successfully!');
console.log('🔑 Auto-generated secure secrets for JWT and admin access\n');

console.log('🚨 NEXT STEPS - UPDATE THESE VALUES:');
console.log('   1. SENDGRID_API_KEY - Get from SendGrid dashboard');
console.log('   2. STRIPE_SECRET_KEY - Use test key (sk_test_...) for development');
console.log('   3. SENDER_EMAIL - Must be verified in SendGrid');
console.log('   4. BASE_URL - Update for your domain\n');

printEnvironmentGuide();

function printEnvironmentGuide() {
  console.log('📖 Environment Variable Guide:');
  console.log('');
  console.log('🏗️  DEVELOPMENT SETUP:');
  console.log('   NODE_ENV=development');
  console.log('   STRIPE_SECRET_KEY=sk_test_... (TEST key only!)');
  console.log('   BASE_URL=http://localhost:3000');
  console.log('');
  console.log('🚀 PRODUCTION SETUP (Railway):');
  console.log('   NODE_ENV=production');
  console.log('   STRIPE_SECRET_KEY=sk_live_... (LIVE key)');
  console.log('   BASE_URL=https://yourdomain.com');
  console.log('   ADMIN_TEST_ENABLED=false (disable admin test route)');
  console.log('');
  console.log('🔒 SECURITY FEATURES:');
  console.log('   • Automatic validation prevents test/live key mismatches');
  console.log('   • Admin test route requires secret token and can be disabled');
  console.log('   • Environment-aware cookie security settings');
  console.log('   • All sensitive data properly excluded from git');
  console.log('');
  console.log('🧪 ADMIN TEST ROUTE USAGE:');
  console.log('   URL: /admin-test?secret=YOUR_ADMIN_SECRET&customerId=cus_ABC123');
  console.log('   • Only enabled when ADMIN_TEST_ENABLED=true');
  console.log('   • Requires ADMIN_TEST_SECRET for access');
  console.log('   • Use live customer IDs to test billing data');
  console.log('   • Automatically disabled if environment mismatch detected');
  console.log('');
} 