# PingPay Checkout Merchant Demo

This is an example merchant application demonstrating how to integrate PingPay Checkout into your application.

## How It Works

1. **Create a Checkout Session**: Call the `POST /checkout/sessions` API endpoint with payment details
2. **Get Session URL**: The API returns a `sessionUrl` that you can redirect users to
3. **User Completes Payment**: The user is redirected to the checkout page where they:
   - Connect their NEAR wallet
   - Review payment details
   - Complete the payment
4. **Redirect Back**: After payment completion, the user is redirected to your `successUrl` or `cancelUrl`

## Running the Demo

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open the app in your browser (usually `http://localhost:5173`)

4. Fill in the form:
   - **API URL**: Your PingPay API endpoint (default: `http://localhost:3014/api/rpc`)
   - **Amount**: Payment amount in smallest units (e.g., `1000000` for 1 USDC with 6 decimals)
   - **Asset ID**: The asset to receive (e.g., `nep141:usdc.near`)
   - **Recipient Address**: Your NEAR account address
   - **Chain ID**: The chain ID (e.g., `near:mainnet`)
   - **Success/Cancel URLs**: Optional redirect URLs

5. Click "Create Checkout Session" and then "Open Checkout Page"

## API Integration Example

```typescript
const response = await fetch('http://localhost:3014/api/rpc/checkout/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    amount: {
      assetId: 'nep141:usdc.near',
      amount: '1000000', // 1 USDC
    },
    recipient: {
      address: 'merchant.near',
      chainId: 'near:mainnet',
    },
    successUrl: 'https://yoursite.com/success',
    cancelUrl: 'https://yoursite.com/cancel',
  }),
});

const { sessionUrl, session } = await response.json();

// Redirect user to checkout page
window.location.href = `${sessionUrl}?sessionId=${session.sessionId}`;
```

## Checkout URL Format

The checkout URL format is:
```
https://pay.pingpay.io/checkout?sessionId={sessionId}
```

Or for local development:
```
http://localhost:5173/checkout?sessionId={sessionId}
```

## Notes

- Make sure your API server is running and accessible
- The checkout page requires users to connect their NEAR wallet
- Payments are processed through NEAR intents for cross-chain compatibility
- The session expires after 1 hour by default

