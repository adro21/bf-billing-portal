#!/bin/bash

echo "🔧 Resend Setup Helper"
echo "======================"
echo ""
echo "This script will help you switch from SendGrid to Resend."
echo ""
echo "📋 Step 1: Get your Resend API key"
echo "   1. Open: https://resend.com/signup"
echo "   2. Create account (free, no credit card)"
echo "   3. Go to: https://resend.com/api-keys"
echo "   4. Click 'Create API Key'"
echo "   5. Copy the key (starts with 're_')"
echo ""
echo "Press Enter when you have your API key ready..."
read -r

echo ""
echo "📝 Step 2: Enter your Resend API key"
echo -n "Paste your API key here: "
read -r RESEND_KEY

# Validate the key format
if [[ ! $RESEND_KEY == re_* ]]; then
    echo ""
    echo "⚠️  Warning: The key doesn't start with 're_'"
    echo "   Are you sure this is a Resend API key?"
    echo -n "Continue anyway? (y/n): "
    read -r continue
    if [[ ! $continue == "y" ]]; then
        echo "❌ Cancelled. Run this script again when you have the correct key."
        exit 1
    fi
fi

echo ""
echo "📧 Step 3: Choose your sender email"
echo ""
echo "Option 1: Quick Test (works immediately)"
echo "   → onboarding@resend.dev"
echo "   ℹ️  Good for testing, but emails won't actually deliver"
echo ""
echo "Option 2: Production (requires domain verification)"
echo "   → billing@bounceforwardco.com"
echo "   ℹ️  Real emails, but you need to verify your domain first"
echo ""
echo "Which option? (1 or 2): "
read -r email_option

if [[ $email_option == "1" ]]; then
    SENDER_EMAIL="onboarding@resend.dev"
    echo "✅ Using test email: $SENDER_EMAIL"
elif [[ $email_option == "2" ]]; then
    SENDER_EMAIL="billing@bounceforwardco.com"
    echo "✅ Using production email: $SENDER_EMAIL"
    echo ""
    echo "⚠️  IMPORTANT: You must verify your domain in Resend:"
    echo "   1. Go to: https://resend.com/domains"
    echo "   2. Click 'Add Domain'"
    echo "   3. Enter: bounceforwardco.com"
    echo "   4. Add the DNS records they provide"
    echo "   5. Wait for verification (~5-10 minutes)"
else
    echo "❌ Invalid option. Please run again and choose 1 or 2."
    exit 1
fi

echo ""
echo "💾 Step 4: Updating your .env file..."

# Create backup
cp .env .env.backup
echo "   ✅ Backup created: .env.backup"

# Update the .env file
sed -i.tmp "s/SENDGRID_API_KEY=.*/RESEND_API_KEY=$RESEND_KEY/" .env
sed -i.tmp "s/# SendGrid API Key.*/# Resend API Key for sending magic link emails (Free: 3,000 emails\/month)/" .env
sed -i.tmp "s/SENDER_EMAIL=.*/SENDER_EMAIL=$SENDER_EMAIL/" .env
sed -i.tmp "s/# Verified sender email address for SendGrid/# Sender email address for Resend/" .env
rm .env.tmp

echo "   ✅ .env file updated"
echo ""
echo "✅ Setup complete!"
echo ""
echo "🧪 Step 5: Test your configuration"
echo "   Run: npm test"
echo ""
echo "🚀 Step 6: Start your server"
echo "   Run: npm start"
echo ""
echo "📝 Note: Your old .env is backed up as .env.backup"
echo ""

