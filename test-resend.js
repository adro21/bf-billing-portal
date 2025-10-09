require('dotenv').config();
const { Resend } = require('resend');

async function testResend() {
  console.log('🔍 Testing Resend Configuration...\n');
  
  // Check environment variables
  const apiKey = process.env.RESEND_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL;
  
  console.log('✅ Environment Variables:');
  console.log('   RESEND_API_KEY:', apiKey ? `${apiKey.substring(0, 10)}...` : '❌ MISSING');
  console.log('   SENDER_EMAIL:', senderEmail || '❌ MISSING');
  console.log();
  
  if (!apiKey) {
    console.error('❌ ERROR: RESEND_API_KEY is not set in .env file');
    console.error('\n📚 Setup Instructions:');
    console.error('   1. Go to https://resend.com/signup');
    console.error('   2. Create a free account (no credit card needed)');
    console.error('   3. Go to https://resend.com/api-keys');
    console.error('   4. Click "Create API Key"');
    console.error('   5. Copy the API key (starts with "re_")');
    console.error('   6. Add to .env file: RESEND_API_KEY=re_...');
    process.exit(1);
  }
  
  if (!senderEmail) {
    console.error('❌ ERROR: SENDER_EMAIL is not set in .env file');
    process.exit(1);
  }
  
  // Initialize Resend
  const resend = new Resend(apiKey);
  
  // Determine recipient for test email
  let testRecipient = senderEmail;
  if (senderEmail.includes('onboarding@resend.dev')) {
    // If using Resend's test email, send to a real email for testing
    console.log('⚠️  You are using onboarding@resend.dev as sender.');
    console.log('    For testing, we will send to delivered@resend.dev (Resend test inbox)');
    testRecipient = 'delivered@resend.dev';
  }
  
  // Try to send a test email
  const emailData = {
    from: `Bounce Forward Test <${senderEmail}>`,
    to: [testRecipient],
    subject: 'Resend Configuration Test ✅',
    html: `
      <h2>Success! 🎉</h2>
      <p>Your Resend configuration is working correctly.</p>
      <p><strong>From:</strong> ${senderEmail}</p>
      <p><strong>To:</strong> ${testRecipient}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <hr>
      <p style="color: #666; font-size: 12px;">
        This is a test email from your Bounce Forward billing portal.
      </p>
    `
  };
  
  console.log('📧 Attempting to send test email...');
  console.log('   From:', senderEmail);
  console.log('   To:', testRecipient);
  console.log();
  
  try {
    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('❌ FAILED to send email\n');
      console.error('Error Details:', error);
      
      // Provide helpful guidance based on error
      if (error.message?.includes('domain') || error.message?.includes('verify')) {
        console.error('\n💡 SOLUTION: Your sender email domain needs to be verified.');
        console.error('   Option 1 (Quick Test):');
        console.error('      - Use SENDER_EMAIL=onboarding@resend.dev in your .env');
        console.error('      - This works immediately for testing');
        console.error('');
        console.error('   Option 2 (Production):');
        console.error('      1. Go to https://resend.com/domains');
        console.error('      2. Click "Add Domain"');
        console.error(`      3. Add your domain (e.g., bounceforwardco.com)`);
        console.error('      4. Add the DNS records they provide');
        console.error('      5. Verify the domain');
        console.error(`      6. Use SENDER_EMAIL=billing@yourdomain.com`);
      }
      
      process.exit(1);
    }
    
    console.log('✅ SUCCESS! Email sent successfully!');
    console.log('   Email ID:', data.id);
    console.log();
    console.log('🎉 Your Resend configuration is working correctly!');
    
    if (testRecipient === 'delivered@resend.dev') {
      console.log('📬 Since you used onboarding@resend.dev, the email was sent to Resend\'s test inbox.');
      console.log('   You won\'t receive it in a real inbox, but the API call succeeded!');
    } else {
      console.log(`📬 Check ${testRecipient} for the test email.`);
    }
    
    console.log();
    console.log('📊 Resend Free Tier:');
    console.log('   • 3,000 emails per month');
    console.log('   • 100 emails per day');
    console.log('   • Perfect for your ~5 emails/month use case!');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

testResend();

