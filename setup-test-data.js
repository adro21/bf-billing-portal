require('dotenv').config();
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const setupTestData = async () => {
  try {
    console.log('🚀 Setting up test billing data...\n');

    // Test customer email (use your email to test login)
    const testEmail = process.env.TEST_EMAIL || 'your-email@example.com';
    
    // 1. Create or find test customer
    console.log('👤 Creating test customer...');
    let customer;
    const existingCustomers = await stripe.customers.list({ email: testEmail, limit: 1 });
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log(`✅ Found existing customer: ${customer.id}`);
    } else {
      customer = await stripe.customers.create({
        email: testEmail,
        name: 'Test Customer',
        description: 'Test customer for billing portal'
      });
      console.log(`✅ Created new customer: ${customer.id}`);
    }

    // 2. Create test invoices with different statuses
    console.log('\n📄 Creating test invoices...');
    
    const invoices = [];
    
    // Paid invoice from last month
    const paidInvoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'charge_automatically',
      auto_advance: false, // Don't auto-finalize
      metadata: {
        'test': 'true',
        'description': 'Monthly SaaS Subscription - Pro Plan'
      }
    });
    
    // Add line item
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: paidInvoice.id,
      amount: 4999, // $49.99
      currency: 'usd',
      description: 'Pro Plan - Monthly Subscription',
    });
    
    // Finalize and pay the invoice
    const finalizedPaid = await stripe.invoices.finalizeInvoice(paidInvoice.id);
    await stripe.invoices.pay(finalizedPaid.id, {
      payment_method: 'pm_card_visa' // Test payment method
    });
    
    invoices.push(finalizedPaid);
    console.log(`✅ Created PAID invoice: ${finalizedPaid.id} - $49.99`);
    
    // Open invoice (unpaid)
    const openInvoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: false,
      metadata: {
        'test': 'true',
        'description': 'Monthly SaaS Subscription - Pro Plan'
      }
    });
    
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: openInvoice.id,
      amount: 4999, // $49.99
      currency: 'usd',
      description: 'Pro Plan - Monthly Subscription',
    });
    
    const finalizedOpen = await stripe.invoices.finalizeInvoice(openInvoice.id);
    invoices.push(finalizedOpen);
    console.log(`✅ Created OPEN invoice: ${finalizedOpen.id} - $49.99`);
    
    // Another paid invoice (different amount)
    const paidInvoice2 = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'charge_automatically',
      auto_advance: false,
      metadata: {
        'test': 'true',
        'description': 'Setup Fee'
      }
    });
    
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: paidInvoice2.id,
      amount: 9900, // $99.00
      currency: 'usd',
      description: 'One-time Setup Fee',
    });
    
    const finalizedPaid2 = await stripe.invoices.finalizeInvoice(paidInvoice2.id);
    await stripe.invoices.pay(finalizedPaid2.id, {
      payment_method: 'pm_card_visa'
    });
    
    invoices.push(finalizedPaid2);
    console.log(`✅ Created PAID invoice: ${finalizedPaid2.id} - $99.00`);
    
    console.log('\n🎉 Test data setup complete!');
    console.log('\n📋 Summary:');
    console.log(`Customer: ${customer.email} (${customer.id})`);
    console.log(`Invoices created: ${invoices.length}`);
    console.log('- 2 PAID invoices ($49.99, $99.00)');
    console.log('- 1 OPEN invoice ($49.99)');
    
    console.log('\n🧪 Next steps:');
    console.log('1. Go to your billing portal: http://localhost:3000');
    console.log(`2. Enter email: ${testEmail}`);
    console.log('3. Check your email for the magic link');
    console.log('4. View your test invoices in the dashboard!');
    
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
  }
};

setupTestData(); 