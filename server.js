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
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Access Your Billing History</h2>
          <p>Click the button below to securely access your billing portal:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Access Billing Portal
            </a>
          </div>
          <p><strong>This link will expire in 15 minutes.</strong></p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${magicLink}</p>
        </div>
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
        error: 'No billing history found for this email address',
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
    const invoices = invoicesResponse.status === 'fulfilled' ? invoicesResponse.value.data : [];
    const subscriptions = subscriptionsResponse.status === 'fulfilled' ? subscriptionsResponse.value.data : [];
    const paymentMethods = paymentMethodsResponse.status === 'fulfilled' ? paymentMethodsResponse.value.data : [];
    const upcomingInvoice = upcomingInvoiceResponse.status === 'fulfilled' ? upcomingInvoiceResponse.value : null;
    const customerPortalUrl = customerPortalSession.status === 'fulfilled' ? customerPortalSession.value.url : null;

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
    const invoices = invoicesResponse.status === 'fulfilled' ? invoicesResponse.value.data : [];
    const subscriptions = subscriptionsResponse.status === 'fulfilled' ? subscriptionsResponse.value.data : [];
    const paymentMethods = paymentMethodsResponse.status === 'fulfilled' ? paymentMethodsResponse.value.data : [];
    const upcomingInvoice = upcomingInvoiceResponse.status === 'fulfilled' ? upcomingInvoiceResponse.value : null;
    const customerPortalUrl = customerPortalSession.status === 'fulfilled' ? customerPortalSession.value.url : null;

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
      isAdminTest: true  // Flag for template to show admin warning
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