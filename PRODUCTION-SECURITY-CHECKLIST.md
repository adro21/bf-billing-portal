# 🔒 Production Security Checklist

This checklist ensures your billing portal is production-ready and secure.

## ✅ **Environment & Configuration**

### Required Environment Variables
- [ ] `NODE_ENV=production`
- [ ] `STRIPE_SECRET_KEY=sk_live_...` (LIVE key only in production)
- [ ] `SENDGRID_API_KEY=SG.xxx...` (verified sender)
- [ ] `JWT_SECRET` (64+ characters, cryptographically secure)
- [ ] `SENDER_EMAIL` (verified in SendGrid)
- [ ] `BASE_URL=https://yourdomain.com` (production domain)
- [ ] `ADMIN_PASSWORD` (12+ characters, strong password)

### Security Validation
- [ ] Automatic environment validation passes on startup
- [ ] No test Stripe keys in production environment
- [ ] No development-only features enabled
- [ ] All secrets are unique per environment (dev vs prod)

## 🛡️ **Application Security**

### Authentication & Authorization
- [ ] JWT tokens have 15-minute expiration
- [ ] Cookies are HttpOnly and Secure in production
- [ ] Admin sessions expire after 2 hours
- [ ] Rate limiting active (3 magic links per 15 minutes)
- [ ] Admin access requires strong password authentication

### Security Headers
- [ ] X-Frame-Options: DENY (prevents clickjacking)
- [ ] X-Content-Type-Options: nosniff (prevents MIME sniffing)
- [ ] X-XSS-Protection: enabled
- [ ] Content-Security-Policy: configured
- [ ] Referrer-Policy: strict-origin-when-cross-origin

### Input Validation
- [ ] Email validation on all user inputs
- [ ] Stripe customer ID validation for admin access
- [ ] JWT token validation on all protected routes
- [ ] Admin password length validation (minimum 12 chars)

## 🔍 **Monitoring & Logging**

### Security Audit Logs
- [ ] Admin login attempts logged
- [ ] Customer lookups logged with timestamps
- [ ] Failed authentication attempts logged
- [ ] Environment misconfigurations logged
- [ ] Stripe API errors logged

### Access Monitoring
- [ ] Admin access to customer data is logged
- [ ] Magic link generation is logged
- [ ] Failed login attempts are tracked
- [ ] Rate limit violations are logged

## 🌐 **Infrastructure Security**

### HTTPS & TLS
- [ ] HTTPS enforced on all routes
- [ ] Valid SSL certificate installed
- [ ] HTTP redirects to HTTPS
- [ ] Secure cookie flag enabled in production

### Service Configuration
- [ ] SendGrid sender verification completed
- [ ] Stripe webhook endpoints secured (if using webhooks)
- [ ] Railway deployment environment variables secured
- [ ] No sensitive data in logs or error messages

## 📧 **Email Security**

### SendGrid Configuration
- [ ] Sender email verified and authenticated
- [ ] API key has minimal required permissions
- [ ] Bounce handling configured
- [ ] Spam complaint monitoring enabled

### Magic Link Security
- [ ] 15-minute expiration enforced
- [ ] Single-use tokens (JWT expiration)
- [ ] Secure token generation (cryptographic random)
- [ ] Base URL validation prevents URL manipulation

## 🔐 **Data Protection**

### Customer Data
- [ ] No customer data stored locally (fetched from Stripe)
- [ ] PII properly handled in logs
- [ ] Admin access to customer data is justified and logged
- [ ] Data access follows principle of least privilege

### Encryption
- [ ] JWT tokens cryptographically signed
- [ ] Sensitive cookies encrypted
- [ ] All communication over HTTPS
- [ ] Environment variables secured in Railway

## 🚨 **Incident Response**

### Security Monitoring
- [ ] Admin access anomalies can be detected
- [ ] Failed authentication patterns monitored
- [ ] Rate limiting violations tracked
- [ ] Stripe API error patterns monitored

### Response Procedures
- [ ] Process for rotating JWT_SECRET if compromised
- [ ] Process for disabling admin access if needed
- [ ] Process for investigating customer data access
- [ ] Stripe account security contact information available

## 🧪 **Pre-Production Testing**

### Security Testing
- [ ] Admin portal login tested with production password
- [ ] Customer email lookup tested with real data
- [ ] Magic link flow tested end-to-end
- [ ] Rate limiting tested and working
- [ ] Error handling tested (invalid emails, expired tokens)

### Integration Testing
- [ ] SendGrid email delivery working
- [ ] Stripe customer lookup working
- [ ] Invoice PDF downloads working
- [ ] ZIP archive generation working
- [ ] Customer portal integration working

## 🔒 **Ongoing Security**

### Regular Security Tasks
- [ ] Rotate JWT_SECRET quarterly
- [ ] Rotate ADMIN_PASSWORD quarterly
- [ ] Review admin access logs monthly
- [ ] Update dependencies for security patches
- [ ] Monitor Stripe account for suspicious activity

### Security Awareness
- [ ] Admin users trained on proper usage
- [ ] Customer support aware of security features
- [ ] Incident response procedures documented
- [ ] Security contact information up to date

---

## 🚀 **Production Deployment Verification**

After deployment, verify these are working:

1. **Visit your portal**: `https://yourdomain.com`
2. **Test magic link**: Enter a real customer email
3. **Check your email**: Verify magic link arrives and works
4. **Test admin portal**: Go to `/admin` and verify login works
5. **Check logs**: Ensure no security warnings in Railway logs
6. **Test customer lookup**: Search for a real customer in admin portal
7. **Verify HTTPS**: Ensure all pages load over HTTPS
8. **Check security headers**: Use online tools to verify headers

## 📞 **Emergency Contacts**

- **Railway Support**: [Railway Help](https://help.railway.app/)
- **Stripe Support**: [Stripe Support](https://support.stripe.com/)
- **SendGrid Support**: [SendGrid Support](https://support.sendgrid.com/)

---

**Last Updated**: [Update this when you deploy]  
**Reviewed By**: [Your team members]  
**Next Review**: [Schedule quarterly review] 