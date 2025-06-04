require('dotenv').config();
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const createTestInvoice = async () => {
  try {
    const testEmail = 'test@example.com'; // Change this to your email

    // Create customer
    const customer = await stripe.customers.create({
      email: testEmail,
      name: 'Test Customer'
    });
    console.log('✅ Customer created:', customer.id);

    // Create invoice (send_invoice method allows manual payment)
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: false // Don't auto-finalize
    });

    // Add line item
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: 5000, // $50.00
      currency: 'usd',
      description: 'Test Service - Monthly Plan'
    });

    // Finalize the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    console.log('🎉 Invoice created successfully!');
    console.log('Invoice ID:', finalizedInvoice.id);
    console.log('Status:', finalizedInvoice.status);
    console.log('Amount:', `$${finalizedInvoice.amount_due / 100}`);
    console.log('\n🔗 View in dashboard:');
    console.log(`https://dashboard.stripe.com/test/invoices/${finalizedInvoice.id}`);
    console.log('\n📝 This invoice can now be manually marked as paid!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

createTestInvoice(); 