export const LoadingSpinner = ({ size = 80 }: { size?: number }) => {
  return (
    <div
      className="rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: '#5A5474'
      }}
    >
      <svg
        className="animate-spin"
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="20"
          cy="20"
          r="16"
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="4"
        />
        <path
          d="M 20 4 A 16 16 0 0 1 36 20"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
