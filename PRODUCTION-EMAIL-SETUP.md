# Production Email Setup - Resend Domain Verification

## Why You Need This
Currently using: `onboarding@resend.dev` (test mode - emails don't deliver)
Production needs: `billing@bounceforwardco.com` (real emails to customers)

## Step-by-Step Domain Verification

### 1. Go to Resend Dashboard
- Open: https://resend.com/domains
- Click the blue **"Add Domain"** button

### 2. Enter Your Domain
- Type: `bounceforwardco.com` (without "billing@" or "https://")
- Click **"Add"**

### 3. Copy DNS Records
Resend will show you 3 DNS records to add. They'll look something like:

```
Type: TXT
Name: @
Value: resend-verify=abc123...

Type: MX
Name: @
Value: mx.resend.com
Priority: 10

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none...
```

### 4. Add DNS Records to Your Domain

**Where to add these depends on your domain provider:**

#### If you use **Cloudflare**:
1. Go to: https://dash.cloudflare.com
2. Select your domain: bounceforwardco.com
3. Click "DNS" in the left menu
4. Click "Add record" for each DNS record
5. Copy the Type, Name, and Value from Resend

#### If you use **Namecheap**:
1. Go to: https://ap.www.namecheap.com/domains/list/
2. Click "Manage" next to bounceforwardco.com
3. Go to "Advanced DNS" tab
4. Add each DNS record

#### If you use **GoDaddy**:
1. Go to: https://dcc.godaddy.com/manage/dns
2. Select bounceforwardco.com
3. Click "Add" for each record
4. Enter the Type, Name, and Value

#### If you use another provider:
- Search for: "[your provider] how to add DNS records"
- You need to add TXT and MX records

### 5. Wait for Verification
- DNS changes take 5-30 minutes to propagate
- Go back to https://resend.com/domains
- Click "Verify" or refresh the page
- When verified, you'll see a green checkmark ✅

### 6. Update Your .env File

Once verified, open your `.env` file and change:

```bash
# FROM:
SENDER_EMAIL=onboarding@resend.dev

# TO:
SENDER_EMAIL=billing@bounceforwardco.com
```

### 7. Restart Your Server

```bash
# Stop the server (Ctrl+C in the terminal where it's running)
# Then start it again:
npm start
```

### 8. Test with Real Email

```bash
# Run this to test with a real email address:
npm test
# When prompted, it should now send from billing@bounceforwardco.com
```

## Troubleshooting

### "Domain not verified" error
- Wait 15-30 minutes for DNS to propagate
- Check that you added ALL the DNS records (usually 3)
- Make sure you added them to the correct domain

### "DNS records not found"
- Double-check the Name and Value match exactly
- Some providers auto-add the domain, so you might only need "@" for the Name
- Try using the full domain in Name if @ doesn't work

### Still having issues?
- Contact Resend support: https://resend.com/support
- They're usually very responsive and helpful

## Quick Command Reference

```bash
# Test your email configuration
npm test

# Start the server
npm start

# View your current .env settings
cat .env | grep -E "RESEND_API_KEY|SENDER_EMAIL"
```

## What Happens After Setup?

Once domain verification is complete:
- ✅ Customers receive real magic link emails
- ✅ Emails come from: billing@bounceforwardco.com
- ✅ Professional appearance
- ✅ Better deliverability
- ✅ Free for 3,000 emails/month (100/day)

## Alternative: Use Resend's Subdomain (Easier)

If domain verification is too complex, Resend can provide a subdomain:

1. Go to: https://resend.com/domains
2. Click "Add Domain"
3. Choose "Use a Resend subdomain"
4. They'll give you something like: `bounceforward.resend.dev`
5. Use: `SENDER_EMAIL=billing@bounceforward.resend.dev`

This works immediately but looks less professional than your own domain.

