# Billing Portal - Secure Stripe Invoice Viewer

A secure web application that allows SaaS customers to view their Stripe billing history using magic link authentication. Built with Node.js, Express, and modern web technologies.

## 🚀 Features

- **🔐 Magic Link Authentication**: Password-free login with JWT tokens
- **📧 Email Integration**: SendGrid-powered magic link delivery
- **💳 Stripe Integration**: View billing history and download invoices
- **🛡️ Security First**: HttpOnly cookies, rate limiting, token expiration
- **📱 Mobile Responsive**: Modern UI that works on all devices
- **⚡ Production Ready**: Error handling, logging, and security best practices

## 🏗️ Tech Stack

- **Backend**: Node.js + Express
- **Authentication**: JWT with HttpOnly cookies
- **Email**: SendGrid API
- **Payments**: Stripe API
- **Frontend**: EJS templating with modern CSS
- **Security**: Rate limiting, CORS, secure cookie settings

## 📋 Prerequisites

Before running this application, make sure you have:

1. **Node.js** (version 14 or higher)
2. **npm** or **yarn**
3. **SendGrid account** with verified sender email
4. **Stripe account** (test mode for development)

## 🔧 Installation & Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd billing-portal
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

```env
# SendGrid API Key for sending magic link emails
SENDGRID_API_KEY=SG.your_sendgrid_api_key_here

# JWT Secret for signing and verifying tokens (use a long random string)
JWT_SECRET=your_very_long_random_jwt_secret_here_at_least_32_characters

# Stripe Secret Key (use test key for development)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here

# Base URL for magic links
BASE_URL=http://localhost:3000

# Verified sender email address for SendGrid
SENDER_EMAIL=billing@yourdomain.com

# Port for the application (optional, defaults to 3000)
PORT=3000
```

### 3. Service Setup

#### SendGrid Setup
1. Create a [SendGrid account](https://sendgrid.com/)
2. Get your API key from Settings → API Keys
3. Verify your sender email address
4. Add the API key and sender email to your `.env` file

#### Stripe Setup
1. Create a [Stripe account](https://stripe.com/)
2. Get your test secret key from Developers → API Keys
3. Add the secret key to your `.env` file
4. Ensure you have test customers and invoices for testing

### 4. Generate JWT Secret

Generate a secure JWT secret:

```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 64
```

## 🚀 Running the Application

### Development Mode

```bash
npm run dev
```

This starts the server with `nodemon` for automatic restarts on file changes.

### Production Mode

```bash
npm start
```

The application will be available at `http://localhost:3000` (or your configured PORT).

## 📖 Usage

### For End Users

1. **Login**: Visit the portal and enter your email address
2. **Magic Link**: Check your email and click the secure login link
3. **Dashboard**: View your billing history and download invoices
4. **Logout**: Use the logout button to end your session

### For Developers

The application provides these main routes:

- `GET /` - Landing page with email form
- `POST /send-magic-link` - Send magic link to user's email
- `GET /verify?token=...` - Verify token and set auth cookie
- `GET /dashboard` - Protected dashboard showing invoices
- `GET /logout` - Clear auth cookie and redirect

## 🔒 Security Features

- **JWT Expiration**: Magic links expire after 15 minutes
- **HttpOnly Cookies**: Tokens are not accessible via JavaScript
- **Rate Limiting**: 3 magic link requests per 15 minutes per IP
- **Secure Headers**: SameSite=Lax, Secure in production
- **Input Validation**: Email validation and sanitization
- **Error Handling**: Graceful error pages and logging

## 🧪 Testing

### Testing Magic Links Locally

Since magic links need to work via email, you have a few options:

1. **Use Real Email**: Configure SendGrid and test with real email addresses
2. **Use ngrok**: Expose your local server to test email links
3. **Check Logs**: Magic links are logged in the console during development

### Using ngrok for Testing

```bash
# Install ngrok
npm install -g ngrok

# In one terminal, start your app
npm run dev

# In another terminal, expose it
ngrok http 3000

# Update your .env BASE_URL to the ngrok URL
BASE_URL=https://abc123.ngrok.io
```

## 📁 Project Structure

```
billing-portal/
├── public/
│   └── css/
│       └── styles.css          # Application styling
├── views/
│   ├── index.ejs              # Landing page
│   ├── dashboard.ejs          # Billing dashboard
│   ├── 404.ejs               # 404 error page
│   └── error.ejs             # Generic error page
├── server.js                  # Main application file
├── package.json              # Dependencies and scripts
├── env.example               # Environment variables template
└── README.md                 # This file
```

## 🚀 Deployment

### Environment Variables for Production

When deploying to production, make sure to:

1. Set `NODE_ENV=production`
2. Use HTTPS and set cookie `secure: true`
3. Update `BASE_URL` to your production domain
4. Use production Stripe keys
5. Configure proper logging

### Example Production Settings

```env
NODE_ENV=production
BASE_URL=https://billing.yourdomain.com
STRIPE_SECRET_KEY=sk_live_your_live_stripe_key
```

### Recommended Platforms

- **Heroku**: Easy deployment with add-ons for environment variables
- **Vercel**: Serverless deployment with environment variable support
- **Railway**: Simple deployment with automatic HTTPS
- **DigitalOcean App Platform**: Container-based deployment

## 🐛 Troubleshooting

### Common Issues

1. **Magic Links Not Working**
   - Check SendGrid API key and sender verification
   - Verify BASE_URL is correct
   - Check spam folder

2. **Stripe Data Not Loading**
   - Verify Stripe secret key is correct
   - Ensure customer exists with the login email
   - Check Stripe dashboard for test data

3. **Authentication Issues**
   - Verify JWT_SECRET is set and consistent
   - Check cookie settings for your domain
   - Ensure system clock is accurate

### Debug Mode

Enable debug logging by setting:

```env
DEBUG=billing-portal:*
```

## 📝 API Documentation

### Authentication Flow

1. User submits email → `POST /send-magic-link`
2. JWT generated with 15min expiry
3. Magic link emailed → `${BASE_URL}/verify?token=${jwt}`
4. User clicks link → `GET /verify`
5. Token verified, cookie set → redirect to `/dashboard`
6. Dashboard loads with auth check → `GET /dashboard`

### Stripe Integration

The app looks up customers by email and retrieves their invoices:

```javascript
const customers = await stripe.customers.list({ email, limit: 1 });
const customer = customers.data[0];
const invoices = await stripe.invoices.list({ customer: customer.id });
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support and questions:

- Create an issue in this repository
- Check the troubleshooting section above
- Review the Stripe and SendGrid documentation

---

**Built with ❤️ for secure, accessible billing transparency.** 