interface CreateCheckoutSessionInput {
  amount: {
    assetId: string;
    amount: string;
  };
  recipient: {
    address: string;
    chainId: string;
  };
  successUrl?: string;
  cancelUrl?: string;
}

interface CreateCheckoutSessionResponse {
  session: {
    sessionId: string;
    status: string;
    amount: {
      assetId: string;
      amount: string;
    };
    recipient: {
      address: string;
      chainId: string;
    };
    createdAt: string;
    expiresAt?: string;
  };
  sessionUrl: string;
}

async function createCheckoutSession(
  apiUrl: string,
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResponse> {
  // This demo uses the OpenAPI/REST handler mounted under `/api`.
  // (The checkout UI uses oRPC under `/api/rpc`.)
  const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  const response = await fetch(`${baseUrl}/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create session' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

function showResult(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const resultDiv = document.getElementById('result');
  if (!resultDiv) return;

  resultDiv.className = `result ${type}`;
  resultDiv.innerHTML = message;
}

function showLoading(button: HTMLButtonElement) {
  button.disabled = true;
  button.innerHTML = '<span class="loading"></span> Creating session...';
}

function hideLoading(button: HTMLButtonElement) {
  button.disabled = false;
  button.innerHTML = 'Proceed to Checkout';
}

document.addEventListener('DOMContentLoaded', () => {
  const proceedBtn = document.getElementById('proceedBtn') as HTMLButtonElement;
  const apiUrl = 'http://localhost:3001/api';

  proceedBtn.addEventListener('click', async () => {
    showLoading(proceedBtn);
    showResult('Creating checkout session...', 'info');

    try {
      // Hardcoded demo values - 1 USDC
      const input: CreateCheckoutSessionInput = {
        amount: {
          assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', // USDC on NEAR
          amount: '1000000', // 1 USDC (6 decimals: 1 * 10^6 = 1000000)
        },
        recipient: {
          address: 'example-merchant.near', //add recipient's near address
          chainId: 'near:mainnet',
        },
      };

      const response = await createCheckoutSession(apiUrl, input);

      // Redirect directly to checkout URL
      window.location.href = response.sessionUrl;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      showResult(
        `Failed to create checkout session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      hideLoading(proceedBtn);
    }
  });
});

