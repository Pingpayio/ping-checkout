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
  const response = await fetch(`${apiUrl}/checkout/sessions`, {
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
  button.innerHTML = 'Create Checkout Session';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('checkoutForm') as HTMLFormElement;
  const submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiUrl = (document.getElementById('apiUrl') as HTMLInputElement).value.trim();
    const amount = (document.getElementById('amount') as HTMLInputElement).value.trim();
    const assetId = (document.getElementById('assetId') as HTMLInputElement).value.trim();
    const recipient = (document.getElementById('recipient') as HTMLInputElement).value.trim();
    const chainId = (document.getElementById('chainId') as HTMLInputElement).value.trim();
    const successUrl = (document.getElementById('successUrl') as HTMLInputElement).value.trim();
    const cancelUrl = (document.getElementById('cancelUrl') as HTMLInputElement).value.trim();

    if (!apiUrl || !amount || !assetId || !recipient || !chainId) {
      showResult('Please fill in all required fields', 'error');
      return;
    }

    showLoading(submitBtn);
    showResult('Creating checkout session...', 'info');

    try {
      const input: CreateCheckoutSessionInput = {
        amount: {
          assetId,
          amount,
        },
        recipient: {
          address: recipient,
          chainId,
        },
      };

      if (successUrl) {
        input.successUrl = successUrl;
      }

      if (cancelUrl) {
        input.cancelUrl = cancelUrl;
      }

      const response = await createCheckoutSession(apiUrl, input);

      const checkoutUrl = new URL(response.sessionUrl);
      checkoutUrl.searchParams.set('sessionId', response.session.sessionId);

      showResult(
        `
          <strong>Checkout session created!</strong><br><br>
          Session ID: <code>${response.session.sessionId}</code><br><br>
          <a href="${checkoutUrl.toString()}" target="_blank" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Open Checkout Page →
          </a>
        `,
        'success'
      );
    } catch (error) {
      console.error('Error creating checkout session:', error);
      showResult(
        `Failed to create checkout session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      hideLoading(submitBtn);
    }
  });
});

