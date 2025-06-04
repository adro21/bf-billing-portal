# Deployment Guide - Railway

This guide covers deploying the billing portal to Railway with proper environment variable management and security.

## 🚀 Railway Deployment Steps

### 1. Environment Variables Setup

In your Railway project, go to the **Variables** tab and add these environment variables:

#### Required Variables
```bash
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_STRIPE_KEY_HERE
SENDGRID_API_KEY=SG.YOUR_SENDGRID_API_KEY
JWT_SECRET=your_secure_jwt_secret_64_chars_minimum
SENDER_EMAIL=billing@yourdomain.com
BASE_URL=https://yourdomain.railway.app
```

#### Security Variables (Optional but Recommended)
```bash
# Disable admin test route in production
ADMIN_TEST_ENABLED=false

# If you need the admin test route temporarily in production
# ADMIN_TEST_ENABLED=true
# ADMIN_TEST_SECRET=your_very_secure_32_char_minimum_secret
```

### 2. Security Checklist

**✅ BEFORE DEPLOYING:**

- [ ] Verify `STRIPE_SECRET_KEY` starts with `sk_live_` (not `sk_test_`)
- [ ] Set `NODE_ENV=production`
- [ ] Update `BASE_URL` to your Railway domain
- [ ] Set `ADMIN_TEST_ENABLED=false` for production
- [ ] Verify `SENDER_EMAIL` is verified in SendGrid
- [ ] Generate a secure JWT_SECRET (64+ characters)

**✅ AFTER DEPLOYING:**

- [ ] Test the application with a real customer email
- [ ] Verify HTTPS is working (cookies will be secure)
- [ ] Check logs for environment validation messages
- [ ] Ensure no test Stripe keys are being used

### 3. Environment Safety Features

The application includes automatic safety checks:

#### Startup Validation
- ✅ Validates all required environment variables
- ✅ Prevents live keys in development
- ✅ Prevents test keys in production
- ✅ Logs environment and key type on startup

#### Runtime Protection
- ✅ Secure cookies in production (HTTPS required)
- ✅ Admin test route can be completely disabled
- ✅ Multiple security layers for admin access

### 4. Testing with Live Customer Data

If you need to test with live customer IDs in production:

#### Option A: Temporary Admin Access
1. Set `ADMIN_TEST_ENABLED=true` in Railway variables
2. Set a secure `ADMIN_TEST_SECRET` (32+ characters)
3. Access via: `https://yourdomain.railway.app/admin-test?secret=YOUR_SECRET&customerId=cus_ABC123`
4. **IMPORTANT:** Set `ADMIN_TEST_ENABLED=false` after testing

#### Option B: Use Stripe Dashboard
- Access customer billing data directly in Stripe Dashboard
- Use Stripe's customer portal preview feature

### 5. Monitoring and Logs

#### Security Logs
The app logs important security events:
```bash
✅ Environment: production
✅ Stripe key type: LIVE
🔧 ADMIN TEST ACCESS: Customer cus_ABC123 accessed at 2024-01-15T10:30:00.000Z
```

#### Common Issues
```bash
❌ Missing required environment variables: STRIPE_SECRET_KEY, JWT_SECRET
❌ SECURITY WARNING: Production environment detected but using test Stripe key!
❌ SECURITY WARNING: Development environment detected but using live Stripe key!
```

### 6. Rolling Back Admin Test Route

To completely remove the admin test functionality:

1. Set `ADMIN_TEST_ENABLED=false` in Railway
2. Or remove the admin test route code entirely:
   - Delete lines with `/admin-test` route in `server.js`
   - Remove `ADMIN_TEST_*` variables from `env.example`

### 7. Environment Variable Examples

#### Development (.env file)
```bash
NODE_ENV=development
STRIPE_SECRET_KEY=sk_test_51ABC...
BASE_URL=http://localhost:3000
ADMIN_TEST_ENABLED=true
```

#### Production (Railway Variables)
```bash
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_51XYZ...
BASE_URL=https://billing.yourdomain.com
ADMIN_TEST_ENABLED=false
```

## 🛡️ Security Best Practices

1. **Never commit `.env` files** - they're already in `.gitignore`
2. **Use different secrets** for development and production
3. **Disable admin test route** in production unless actively needed
4. **Rotate secrets regularly** especially JWT_SECRET and ADMIN_TEST_SECRET
5. **Monitor access logs** for unauthorized admin test access
6. **Use Stripe's test mode** for all development and testing

## 📞 Support

If you encounter issues:
1. Check Railway logs for security warning messages
2. Verify all environment variables are set correctly
3. Ensure Stripe keys match the environment (test vs live) 