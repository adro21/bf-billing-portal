require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const sgMail = require('@sendgrid/mail');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment validation and Stripe client setup
function validateEnvironment() {
  const requiredVars = ['STRIPE_SECRET_KEY', 'JWT_SECRET', 'SENDGRID_API_KEY', 'SENDER_EMAIL', 'BASE_URL'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  // Validate Stripe key matches environment
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production' && !stripeKey.startsWith('sk_live_')) {
    console.error('❌ SECURITY WARNING: Production environment detected but using test Stripe key!');
    process.exit(1);
  }
  
  if (nodeEnv === 'development' && stripeKey.startsWith('sk_live_')) {
    console.error('❌ SECURITY WARNING: Development environment detected but using live Stripe key!');
    console.error('   This could result in charges to real customers. Exiting for safety.');
    process.exit(1);
  }

  console.log(`✅ Environment: ${nodeEnv}`);
  console.log(`✅ Stripe key type: ${stripeKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`);
}

function getStripeClient() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }
  
  return new Stripe(stripeKey);
}

// Validate environment on startup
validateEnvironment();

// Initialize Stripe and SendGrid
const stripe = getStripeClient();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Rate limiting for magic link requests
const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per window
  message: 'Too many magic link requests. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication middleware for protected routes
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.auth;

  if (!token) {
    return res.redirect('/?error=Please log in to view your billing history');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.clearCookie('auth');
    return res.redirect('/?error=Your session has expired. Please log in again');
  }
};

// Routes

// Landing page with email form
app.get('/', (req, res) => {
  const error = req.query.error;
  const message = req.query.message;
  res.render('index', { error, message });
});

// Send magic link
app.post('/send-magic-link', magicLinkLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.redirect('/?error=Please enter a valid email address');
  }

  try {
    // Generate JWT token with 15-minute expiration
    const token = jwt.sign(
      { email: email.toLowerCase().trim() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Create magic link
    const magicLink = `${process.env.BASE_URL}/verify?token=${token}`;

    // Email content
    const msg = {
      to: email,
      from: process.env.SENDER_EMAIL,
      subject: 'Your Billing Portal Login Link',
      text: `Click the following link to access your billing history: ${magicLink}\n\nThis link will expire in 15 minutes.`,
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #E9E2E0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
                
                <!-- Header with Logo -->
                <tr>
                  <td align="center" style="padding: 40px 40px 20px 40px;">
                    <img src="${process.env.BASE_URL}/images/logo.png" alt="Bounce Forward Co." width="120" height="auto" style="display: block; max-width: 120px; height: auto;">
                  </td>
                </tr>
                
                <!-- Main Content -->
                <tr>
                  <td style="padding: 0 40px 40px 40px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      
                      <!-- Title -->
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <h1 style="margin: 0; color: #0f172a; font-size: 28px; font-weight: 700; line-height: 1.2;">Access Your Billing History</h1>
                        </td>
                      </tr>
                      
                      <!-- Description -->
                      <tr>
                        <td align="center" style="padding-bottom: 32px;">
                          <p style="margin: 0; color: #64748b; font-size: 16px; line-height: 1.5;">Click the button below to securely access your billing portal and view your account details.</p>
                        </td>
                      </tr>
                      
                      <!-- CTA Button -->
                      <tr>
                        <td align="center" style="padding-bottom: 32px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="border-radius: 8px; background-color: #C18D85;">
                                <a href="${magicLink}" style="display: inline-block; padding: 16px 32px; background-color: #C18D85; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px; border: none;">Access Billing Portal</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Security Notice -->
                      <tr>
                        <td style="padding: 24px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #C18D85;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 8px 0; color: #334155; font-weight: 600; font-size: 14px;">🔒 Security Notice</p>
                                <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.4;">This secure link will expire in <strong>15 minutes</strong> for your protection. Only you can access your billing data with this link.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Fallback Link -->
                      <tr>
                        <td style="padding-top: 32px; border-top: 1px solid #e2e8f0; margin-top: 32px;">
                          <p style="margin: 0 0 12px 0; color: #64748b; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
                          <p style="margin: 0; word-break: break-all; color: #94a3b8; font-size: 12px; background-color: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">${magicLink}</p>
                        </td>
                      </tr>
                      
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #C18D85; padding: 24px 40px; text-align: center;">
                    <p style="margin: 0; color: #ffffff; font-size: 14px;">© ${new Date().getFullYear()} Bounce Forward Co. Secure billing portal powered by Stripe.</p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      `
    };

    await sgMail.send(msg);
    res.redirect('/?message=Magic link sent! Check your email and click the link to access your billing history');
  } catch (error) {
    console.error('Error sending magic link:', error);
    res.redirect('/?error=Failed to send magic link. Please try again');
  }
});

// Verify magic link and set auth cookie
app.get('/verify', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.redirect('/?error=Invalid or missing verification token');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Set HttpOnly cookie
    res.cookie('auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS required in production
      sameSite: 'Lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.redirect('/dashboard');
  } catch (error) {
    res.redirect('/?error=Your login link has expired or is invalid. Please request a new one');
  }
});

// Dashboard - view billing history
app.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const { email } = req.user;

    // Look up Stripe customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];

    if (!customer) {
      return res.render('dashboard', { 
        email, 
        error: 'We couldn\'t find any billing history for this email. Try using the one you signed up for Bounce Forward with.',
        invoices: [],
        subscriptions: [],
        paymentMethods: [],
        upcomingInvoice: null,
        customerPortalUrl: null
      });
    }

    // Fetch comprehensive billing data in parallel
    const [
      invoicesResponse,
      subscriptionsResponse,
      paymentMethodsResponse,
      upcomingInvoiceResponse,
      customerPortalSession
    ] = await Promise.allSettled([
      // Get invoices for this customer
      stripe.invoices.list({ 
        customer: customer.id,
        limit: 50,
        expand: ['data.subscription']
      }),
      
      // Get active subscriptions
      stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        expand: ['data.items.data.price.product']
      }),
      
      // Get payment methods
      stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card'
      }),
      
      // Get upcoming invoice (if any active subscriptions)
      stripe.invoices.retrieveUpcoming({
        customer: customer.id
      }).catch(() => null), // Don't fail if no upcoming invoice
      
      // Create customer portal session
      stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: `${process.env.BASE_URL}/dashboard`
      })
    ]);

    // Extract data from settled promises
    const allInvoices = invoicesResponse.status === 'fulfilled' ? invoicesResponse.value.data : [];
    const subscriptions = subscriptionsResponse.status === 'fulfilled' ? subscriptionsResponse.value.data : [];
    const paymentMethods = paymentMethodsResponse.status === 'fulfilled' ? paymentMethodsResponse.value.data : [];
    const upcomingInvoice = upcomingInvoiceResponse.status === 'fulfilled' ? upcomingInvoiceResponse.value : null;
    const customerPortalUrl = customerPortalSession.status === 'fulfilled' ? customerPortalSession.value.url : null;

    // Filter out $0 invoices (trials, credits, etc.) to avoid user confusion
    const invoices = allInvoices.filter(invoice => invoice.total > 0);

    res.render('dashboard', { 
      email, 
      customer,
      invoices,
      subscriptions,
      paymentMethods,
      upcomingInvoice,
      customerPortalUrl,
      error: null
    });
  } catch (error) {
    console.error('Error fetching billing data:', error);
    res.render('dashboard', { 
      email: req.user.email, 
      error: 'Failed to load billing history. Please try again',
      invoices: [],
      subscriptions: [],
      paymentMethods: [],
      upcomingInvoice: null,
      customerPortalUrl: null
    });
  }
});

// Admin Test Route - INTERNAL USE ONLY for testing with live customer IDs
// Security: Multiple layers of protection
app.get('/admin-test', async (req, res) => {
  // Layer 1: Environment-aware feature flag check
  const nodeEnv = process.env.NODE_ENV || 'development';
  const adminTestEnabled = process.env.ADMIN_TEST_ENABLED;
  
  // Auto-disable in production unless explicitly enabled
  if (nodeEnv === 'production' && adminTestEnabled !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  // In development, allow if not explicitly disabled
  if (nodeEnv === 'development' && adminTestEnabled === 'false') {
    return res.status(404).json({ error: 'Admin test route disabled' });
  }
  
  // If no explicit setting in development, default to enabled for convenience
  if (nodeEnv === 'development' && !adminTestEnabled) {
    console.log('⚠️  ADMIN_TEST_ENABLED not set - defaulting to enabled in development');
  }
  
  // Layer 2: Environment safety check (extra safety)
  if (nodeEnv === 'development' && process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
    return res.status(403).json({ 
      error: 'Security: Live Stripe key detected in development environment. Admin test route disabled.' 
    });
  }
  
  // Layer 3: Secret token authentication
  const providedSecret = req.query.secret || req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_TEST_SECRET;
  
  if (!expectedSecret || expectedSecret.length < 32) {
    return res.status(500).json({ 
      error: 'Admin test route misconfigured. Secret must be at least 32 characters.' 
    });
  }
  
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing admin secret' });
  }
  
  // Layer 4: Customer ID validation
  const customerId = req.query.customerId;
  if (!customerId || !customerId.startsWith('cus_')) {
    return res.status(400).json({ 
      error: 'Missing or invalid customerId parameter. Must start with cus_' 
    });
  }
  
  try {
    // Fetch customer to verify it exists
    const customer = await stripe.customers.retrieve(customerId);
    
    // Fetch billing data using the same logic as dashboard
    const [
      invoicesResponse,
      subscriptionsResponse,
      paymentMethodsResponse,
      upcomingInvoiceResponse,
      customerPortalSession
    ] = await Promise.allSettled([
      stripe.invoices.list({ 
        customer: customerId,
        limit: 50,
        expand: ['data.subscription']
      }),
      
      stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.items.data.price.product']
      }),
      
      stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      }),
      
      stripe.invoices.retrieveUpcoming({
        customer: customerId
      }).catch(() => null),
      
      stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.BASE_URL}/admin-test?secret=${providedSecret}&customerId=${customerId}`
      })
    ]);

    // Extract data from settled promises
    const allInvoices = invoicesResponse.status === 'fulfilled' ? invoicesResponse.value.data : [];
    const subscriptions = subscriptionsResponse.status === 'fulfilled' ? subscriptionsResponse.value.data : [];
    const paymentMethods = paymentMethodsResponse.status === 'fulfilled' ? paymentMethodsResponse.value.data : [];
    const upcomingInvoice = upcomingInvoiceResponse.status === 'fulfilled' ? upcomingInvoiceResponse.value : null;
    const customerPortalUrl = customerPortalSession.status === 'fulfilled' ? customerPortalSession.value.url : null;

    // Filter out $0 invoices (trials, credits, etc.) to avoid user confusion
    const invoices = allInvoices.filter(invoice => invoice.total > 0);

    // Log the admin access for security audit
    console.log(`🔧 ADMIN TEST ACCESS: Customer ${customerId} accessed at ${new Date().toISOString()}`);
    
    // Render the same dashboard template but with admin context
    res.render('dashboard', { 
      email: customer.email || `Admin Test (${customerId})`,
      customer,
      invoices,
      subscriptions,
      paymentMethods,
      upcomingInvoice,
      customerPortalUrl,
      error: null,
      isAdminTest: true
    });
    
  } catch (error) {
    console.error('Error in admin test route:', error);
    
    if (error.type === 'StripeInvalidRequestError' && error.code === 'resource_missing') {
      return res.status(404).json({ 
        error: `Customer ${customerId} not found in Stripe` 
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch customer billing data',
      details: error.message 
    });
  }
});

// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('auth');
  res.redirect('/?message=You have been logged out successfully');
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).render('error', { error: 'Something went wrong. Please try again later.' });
});

app.listen(PORT, () => {
  console.log(`Billing portal running on http://localhost:${PORT}`);
}); 