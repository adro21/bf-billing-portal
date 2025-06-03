require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const sgMail = require('@sendgrid/mail');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Stripe and SendGrid
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
      secure: false, // Set to true in production with HTTPS
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
        invoices: []
      });
    }

    // Get invoices for this customer
    const invoices = await stripe.invoices.list({ 
      customer: customer.id,
      limit: 50 // Adjust as needed
    });

    res.render('dashboard', { 
      email, 
      customer,
      invoices: invoices.data,
      error: null
    });
  } catch (error) {
    console.error('Error fetching billing data:', error);
    res.render('dashboard', { 
      email: req.user.email, 
      error: 'Failed to load billing history. Please try again',
      invoices: []
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