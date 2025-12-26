export const DeFiPaymentInfo = () => (
  <div
    className="p-4"
    style={{
      backgroundColor: 'rgba(171, 159, 242, 0.45)',
      border: '1px solid rgba(175, 158, 249, 0.3)',
      borderRadius: 'var(--radius-button)'
    }}
  >
    <p className="text-sm text-center" style={{ color: '#DDCEFF' }}>
      This is a DeFi payment which can't be reversed.{' '}
      <a href="#" className="underline hover:no-underline" style={{ color: '#DDCEFF' }}>
        Learn More
      </a>
    </p>
  </div>
);