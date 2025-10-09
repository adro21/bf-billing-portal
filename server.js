require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const Stripe = require('stripe');
const JSZip = require('jszip');
// Using built-in fetch (available in Node.js 18+)

const app = express();
const PORT = process.env.PORT || 3000;

// Environment validation and Stripe client setup
function validateEnvironment() {
  const requiredVars = ['STRIPE_SECRET_KEY', 'JWT_SECRET', 'RESEND_API_KEY', 'SENDER_EMAIL', 'BASE_URL', 'ADMIN_PASSWORD'];
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

// Initialize Stripe and Resend
const stripe = getStripeClient();
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function to intelligently select the best customer for an email
async function selectBestCustomer(email) {
  // Get ALL customers with this email (remove limit: 1)
  const allCustomers = await stripe.customers.list({ 
    email: email.toLowerCase().trim(),
    limit: 100 // Get up to 100 customers with this email
  });

  if (allCustomers.data.length === 0) {
    return null;
  }

  if (allCustomers.data.length === 1) {
    return allCustomers.data[0];
  }

  console.log(`🔍 Found ${allCustomers.data.length} customers for email ${email}, selecting best one...`);

  // Score each customer based on activity and billing data
  const customerScores = await Promise.all(
    allCustomers.data.map(async (customer) => {
      let score = 0;
      
      try {
        // Check for active subscriptions (high priority)
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1
        });
        if (subscriptions.data.length > 0) {
          score += 100; // Very high score for active subscriptions
        }

        // Check for paid invoices (medium-high priority)
        const paidInvoices = await stripe.invoices.list({
          customer: customer.id,
          status: 'paid',
          limit: 10
        });
        score += paidInvoices.data.length * 10; // 10 points per paid invoice

        // Check for total invoice amount (medium priority)
        const allInvoices = await stripe.invoices.list({
          customer: customer.id,
          limit: 20
        });
        const totalAmount = allInvoices.data.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
        score += Math.min(totalAmount / 100, 50); // Up to 50 points based on total amount

        // Check for payment methods (low-medium priority)
        const paymentMethods = await stripe.paymentMethods.list({
          customer: customer.id,
          type: 'card',
          limit: 1
        });
        if (paymentMethods.data.length > 0) {
          score += 20; // 20 points for having payment methods
        }

        // Recency bonus (more recent customers get slight bonus)
        const daysSinceCreated = (Date.now() / 1000 - customer.created) / (24 * 60 * 60);
        if (daysSinceCreated < 30) {
          score += 5; // Small bonus for recent customers
        }

        return { customer, score };
      } catch (error) {
        console.error(`Error scoring customer ${customer.id}:`, error);
        return { customer, score: 0 };
      }
    })
  );

  // Sort by score (highest first) and return the best customer
  customerScores.sort((a, b) => b.score - a.score);
  
  const bestCustomer = customerScores[0];
  console.log(`✅ Selected customer ${bestCustomer.customer.id} with score ${bestCustomer.score} out of ${allCustomers.data.length} options`);
  
  return bestCustomer.customer;
}

// Helper function to get ALL customers for admin lookup with summary data
async function getAllCustomersWithSummary(email) {
  const allCustomers = await stripe.customers.list({ 
    email: email.toLowerCase().trim(),
    limit: 100
  });

  if (allCustomers.data.length === 0) {
    return [];
  }

  // Get summary data for each customer
  const customersWithSummary = await Promise.all(
    allCustomers.data.map(async (customer) => {
      try {
        const [subscriptions, invoices, paymentMethods] = await Promise.allSettled([
          stripe.subscriptions.list({ customer: customer.id, limit: 5 }),
          stripe.invoices.list({ customer: customer.id, limit: 10 }),
          stripe.paymentMethods.list({ customer: customer.id, type: 'card', limit: 1 })
        ]);

        const subs = subscriptions.status === 'fulfilled' ? subscriptions.value.data : [];
        const invs = invoices.status === 'fulfilled' ? invoices.value.data : [];
        const pms = paymentMethods.status === 'fulfilled' ? paymentMethods.value.data : [];

        const activeSubscriptions = subs.filter(sub => sub.status === 'active').length;
        const paidInvoices = invs.filter(inv => inv.status === 'paid').length;
        const totalPaid = invs.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);

        return {
          ...customer,
          summary: {
            activeSubscriptions,
            totalInvoices: invs.length,
            paidInvoices,
            totalPaid,
            hasPaymentMethods: pms.length > 0,
            lastInvoiceDate: invs.length > 0 ? invs[0].created : null
          }
        };
      } catch (error) {
        console.error(`Error getting summary for customer ${customer.id}:`, error);
        return {
          ...customer,
          summary: {
            activeSubscriptions: 0,
            totalInvoices: 0,
            paidInvoices: 0,
            totalPaid: 0,
            hasPaymentMethods: false,
            lastInvoiceDate: null
          }
        };
      }
    })
  );

  // Sort by activity level (most active first)
  customersWithSummary.sort((a, b) => {
    const scoreA = (a.summary.activeSubscriptions * 100) + (a.summary.paidInvoices * 10) + (a.summary.totalPaid / 1000);
    const scoreB = (b.summary.activeSubscriptions * 100) + (b.summary.paidInvoices * 10) + (b.summary.totalPaid / 1000);
    return scoreB - scoreA;
  });

  return customersWithSummary;
}

// Security middleware - add security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (basic)
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "font-src 'self' https://cdn.jsdelivr.net; " +
    "img-src 'self' data:; " +
    "connect-src 'self'"
  );
  
  next();
});

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

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const adminSession = req.cookies.adminAuth;
  
  if (!adminSession) {
    return res.redirect('/admin?error=Please log in to access the admin portal');
  }

  try {
    const decoded = jwt.verify(adminSession, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.redirect('/admin?error=Invalid admin session');
    }
    req.admin = decoded;
    next();
  } catch (error) {
    res.clearCookie('adminAuth');
    return res.redirect('/admin?error=Your admin session has expired. Please log in again');
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

    // Create magic link (normalize BASE_URL to remove trailing slash)
    const baseUrl = process.env.BASE_URL.replace(/\/$/, '');
    const magicLink = `${baseUrl}/verify?token=${token}`;

    // Email content using Resend
    const emailData = {
      from: `Bounce Forward Billing <${process.env.SENDER_EMAIL}>`,
      to: [email],
      subject: 'Access Bounce Forward Billing Portal',
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #E9E2E0; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
                
                <!-- Header with Logo -->
                <tr>
                  <td align="center" style="padding: 40px 40px 20px 40px;">
                    <img src="${process.env.BASE_URL}/images/logo.png" alt="Bounce Forward Co." width="150" height="auto" style="display: block; max-width: 150px; height: auto;">
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

    const { data, error: resendError } = await resend.emails.send(emailData);
    
    if (resendError) {
      console.error('Error sending magic link:', resendError);
      return res.redirect('/?error=Failed to send magic link. Please try again');
    }
    
    console.log('✅ Magic link sent successfully:', data?.id);
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

    // Use intelligent customer selection to handle multiple customers with same email
    const customer = await selectBestCustomer(email);

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
        expand: ['data.items.data.price']
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
        return_url: `${process.env.BASE_URL.replace(/\/$/, '')}/dashboard`
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

// Legacy admin-test route removed - use the new Admin Portal at /admin instead

// Download all invoices as ZIP
app.get('/download-all-invoices', async (req, res) => {
  try {
    let customer = null;
    let email = null;
    let isAdminAccess = false;

    // Check for customer authentication first
    const authToken = req.cookies.auth;
    const adminToken = req.cookies.adminAuth;
    
    if (authToken) {
      // Customer session
      try {
        const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
        email = decoded.email;
        
        // Use intelligent customer selection
        customer = await selectBestCustomer(email);

        if (!customer) {
          return res.status(404).json({ error: 'Customer not found' });
        }
      } catch (error) {
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
    } else if (adminToken) {
      // Admin session - check for customer ID parameter
      try {
        const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
          return res.status(401).json({ error: 'Invalid admin session' });
        }
        
        isAdminAccess = true;
        const customerId = req.query.customerId;
        
        if (!customerId || !customerId.startsWith('cus_')) {
          return res.status(400).json({ error: 'Customer ID required for admin access' });
        }
        
        // Get customer directly by ID
        customer = await stripe.customers.retrieve(customerId);
        email = customer.email || `Admin Download (${customerId})`;
        
        // Log admin access
        console.log(`📁 Admin downloading invoices for customer: ${customer.email} (${customerId}) at ${new Date().toISOString()}`);
        
      } catch (error) {
        if (error.type === 'StripeInvalidRequestError') {
          return res.status(404).json({ error: 'Customer not found' });
        }
        return res.status(401).json({ error: 'Invalid admin authentication token' });
      }
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get all invoices for this customer
    const allInvoices = await stripe.invoices.list({ 
      customer: customer.id,
      limit: 100, // Stripe's max, would need pagination for more
      expand: ['data.lines']
    });

    // Filter out $0 invoices and invoices without PDFs
    const validInvoices = allInvoices.data.filter(invoice => 
      invoice.total > 0 && invoice.invoice_pdf
    );

    if (validInvoices.length === 0) {
      return res.status(404).json({ error: 'No downloadable invoices found' });
    }

    // Create ZIP file
    const zip = new JSZip();
    let successCount = 0;
    let errorCount = 0;

    // Download each PDF and add to ZIP
    for (const invoice of validInvoices) {
      try {
        console.log(`Downloading invoice ${invoice.number || invoice.id}...`);
        console.log(`PDF URL: ${invoice.invoice_pdf}`);
        
        const pdfResponse = await fetch(invoice.invoice_pdf);
        if (!pdfResponse.ok) {
          console.error(`Failed to download invoice ${invoice.number || invoice.id}: ${pdfResponse.statusText}`);
          errorCount++;
          continue;
        }
        
        console.log(`Response headers for ${invoice.number || invoice.id}:`, {
          'content-type': pdfResponse.headers.get('content-type'),
          'content-length': pdfResponse.headers.get('content-length')
        });
        
        const pdfArrayBuffer = await pdfResponse.arrayBuffer();
        console.log(`Downloaded ${pdfArrayBuffer.byteLength} bytes for invoice ${invoice.number || invoice.id}`);
        
        if (pdfArrayBuffer.byteLength === 0) {
          console.error(`Empty PDF data for invoice ${invoice.number || invoice.id}`);
          errorCount++;
          continue;
        }
        
        const pdfBuffer = Buffer.from(pdfArrayBuffer);
        
        // Verify it's actually a PDF
        if (pdfBuffer.length < 4 || pdfBuffer.toString('ascii', 0, 4) !== '%PDF') {
          console.error(`Invalid PDF data for invoice ${invoice.number || invoice.id} - first 20 bytes:`, pdfBuffer.slice(0, 20));
          errorCount++;
          continue;
        }
        
        // Create filename
        const date = new Date(invoice.created * 1000);
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const invoiceNumber = invoice.number || invoice.id.substring(3, 10); // Remove 'in_' prefix if no number
        const amount = (invoice.total / 100).toFixed(2);
        
        const filename = `${dateStr}_Invoice_${invoiceNumber}_$${amount}.pdf`;
        console.log(`Adding to ZIP: ${filename} (${pdfBuffer.length} bytes)`);
        
        zip.file(filename, pdfBuffer);
        successCount++;
        
      } catch (error) {
        console.error(`Error processing invoice ${invoice.number || invoice.id}:`, error.message);
        console.error(`Error stack:`, error.stack);
        errorCount++;
      }
    }

    if (successCount === 0) {
      return res.status(500).json({ error: 'Failed to download any invoices' });
    }

    // Generate ZIP file
    console.log(`Generating ZIP with ${successCount} invoices...`);
    console.log(`ZIP contents:`, Object.keys(zip.files));
    
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    console.log(`Generated ZIP buffer size: ${zipBuffer.length} bytes`);
    
    // Verify ZIP file starts with correct magic bytes
    if (zipBuffer.length < 4 || (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4B)) {
      console.error('Generated ZIP file has invalid magic bytes:', zipBuffer.slice(0, 10));
      return res.status(500).json({ error: 'Failed to generate valid ZIP file' });
    }

    // Send ZIP file
    const customerName = customer.name || email.split('@')[0];
    const zipFilename = `${customerName}_Invoices_${new Date().toISOString().split('T')[0]}.zip`;
    
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
      'Content-Length': zipBuffer.length
    });

    console.log(`✅ ZIP download complete: ${successCount} invoices, ${errorCount} errors`);
    console.log(`Sending ZIP: ${zipFilename} (${zipBuffer.length} bytes)`);
    res.send(zipBuffer);

  } catch (error) {
    console.error('Error creating invoice ZIP:', error);
    res.status(500).json({ 
      error: 'Failed to create invoice archive',
      details: error.message 
    });
  }
});

// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('auth');
  res.redirect('/?message=You have been logged out successfully');
});

// Admin login page
app.get('/admin', (req, res) => {
  const error = req.query.error;
  const message = req.query.message;
  res.render('admin-login', { error, message });
});

// Admin login processing
app.post('/admin/login', async (req, res) => {
  const { adminPassword } = req.body;
  
  if (!adminPassword) {
    return res.redirect('/admin?error=Please enter the admin password');
  }
  
  // Verify admin password
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword || expectedPassword.length < 12) {
    console.error('❌ ADMIN_PASSWORD not set or too short (minimum 12 characters required)');
    return res.redirect('/admin?error=Admin portal is not properly configured');
  }
  
  if (adminPassword !== expectedPassword) {
    console.log(`⚠️ Failed admin login attempt at ${new Date().toISOString()}`);
    return res.redirect('/admin?error=Invalid admin password');
  }
  
  // Create admin session
  const adminToken = jwt.sign(
    { role: 'admin', loginTime: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: '2h' } // 2 hour admin sessions
  );
  
  // Set admin auth cookie
  res.cookie('adminAuth', adminToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  });
  
  console.log(`✅ Admin login successful at ${new Date().toISOString()}`);
  res.redirect('/admin/dashboard');
});

// Admin dashboard
app.get('/admin/dashboard', authenticateAdmin, (req, res) => {
  res.render('admin-dashboard', { 
    error: null, 
    message: null, 
    customers: [], 
    searchEmail: null 
  });
});

// Customer lookup
app.post('/admin/lookup', authenticateAdmin, async (req, res) => {
  const { customerEmail } = req.body;
  
  if (!customerEmail || !customerEmail.includes('@')) {
    return res.render('admin-dashboard', { 
      error: 'Please enter a valid email address', 
      message: null, 
      customers: [], 
      searchEmail: customerEmail 
    });
  }
  
  try {
    // Get ALL customers for this email with summary data
    const customersWithSummary = await getAllCustomersWithSummary(customerEmail);
    
    if (customersWithSummary.length === 0) {
      return res.render('admin-dashboard', { 
        error: `No customers found with email: ${customerEmail}`, 
        message: null, 
        customers: [], 
        searchEmail: customerEmail 
      });
    }
    
    // Log the lookup for security audit
    console.log(`🔍 Admin customer lookup: ${customerEmail} - found ${customersWithSummary.length} customer(s) at ${new Date().toISOString()}`);
    
    res.render('admin-dashboard', { 
      error: null, 
      message: customersWithSummary.length > 1 ? 
        `Found ${customersWithSummary.length} customers with this email. The most active customer is shown first.` : 
        null, 
      customers: customersWithSummary, 
      searchEmail: customerEmail 
    });
    
  } catch (error) {
    console.error('Error looking up customer:', error);
    res.render('admin-dashboard', { 
      error: 'Failed to search for customer. Please try again.', 
      message: null, 
      customers: [], 
      searchEmail: customerEmail 
    });
  }
});

// View customer dashboard (admin)
app.get('/admin/view-customer/:customerId', authenticateAdmin, async (req, res) => {
  const { customerId } = req.params;
  
  if (!customerId || !customerId.startsWith('cus_')) {
    return res.redirect('/admin/dashboard?error=Invalid customer ID');
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
        expand: ['data.items.data.price']
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
        return_url: `${process.env.BASE_URL.replace(/\/$/, '')}/admin/dashboard`
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
    console.log(`👁️ Admin viewing customer dashboard: ${customer.email} (${customerId}) at ${new Date().toISOString()}`);
    
    // Render the same dashboard template but with admin context
    res.render('dashboard', { 
      email: customer.email || `Admin View (${customerId})`,
      customer,
      invoices,
      subscriptions,
      paymentMethods,
      upcomingInvoice,
      customerPortalUrl,
      error: null,
      isAdminView: true
    });
    
  } catch (error) {
    console.error('Error in admin customer view:', error);
    
    if (error.type === 'StripeInvalidRequestError' && error.code === 'resource_missing') {
      return res.redirect('/admin/dashboard?error=Customer not found in Stripe');
    }
    
    return res.redirect('/admin/dashboard?error=Failed to load customer dashboard');
  }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  res.clearCookie('adminAuth');
  console.log(`🚪 Admin logout at ${new Date().toISOString()}`);
  res.redirect('/admin?message=You have been logged out successfully');
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